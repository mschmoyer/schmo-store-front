/**
 * Product slugs: deriving them, keeping them unique, and not losing traffic when they change.
 *
 * A slug is a URL. That is the whole reason this module is more than a `toLowerCase()` call.
 * Renaming "Aviator Headphones" to "Aviator Pro Headphones" changes the storefront URL, and every
 * link, bookmark and search result pointing at the old one starts returning 404 — the merchant's
 * own successful SEO work, deleted by an edit that looked cosmetic. `recordSlugChange` keeps the
 * old slug in `product_slug_history` so the storefront can answer with a 301 instead.
 */

import type { PoolClient } from 'pg';
import { db } from '@/lib/database/connection';

/**
 * Something that can run a query: the pool, or a client already inside a transaction.
 *
 * Every function here takes one, and callers inside `db.transaction` MUST pass the client. Using
 * the pool from inside a transaction takes a second connection, and a second connection cannot see
 * — or wait politely for — the row locks the first one is holding.
 */
export interface SlugExecutor {
  query<T extends Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
}

/**
 * Narrow the pool or a transaction client to the shape these queries need.
 *
 * @param executor - A transaction client, or nothing to use the pool.
 * @returns Something with a `query` method.
 */
function runner(executor?: PoolClient | SlugExecutor): SlugExecutor {
  return (executor as SlugExecutor) ?? (db as unknown as SlugExecutor);
}

/**
 * Convert arbitrary text into a URL-safe slug.
 *
 * Accented characters are decomposed and stripped rather than dropped whole, so "Café Crème"
 * becomes `cafe-creme` rather than `caf-crme`.
 *
 * @param input - Any text, typically a product name.
 * @returns A lowercase hyphenated slug, or an empty string when the input has no usable characters.
 */
export function slugify(input: string): string {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

/**
 * Find a slug that is free within a store, appending `-2`, `-3`, … until one is.
 *
 * Uniqueness is checked against both live products and retired slugs: reusing a slug that used to
 * belong to a different product would make the redirect point somewhere wrong, which is worse than
 * the 404 it was meant to prevent.
 *
 * @param storeId - The tenant to check within.
 * @param desired - The preferred slug or the text to derive one from.
 * @param excludeProductId - A product allowed to keep its own current slug, when renaming.
 * @param executor - The transaction client, when called inside one. See {@link SlugExecutor}.
 * @returns A slug guaranteed free in this store at the time of the call.
 */
export async function uniqueProductSlug(
  storeId: string,
  desired: string,
  excludeProductId?: string,
  executor?: PoolClient | SlugExecutor
): Promise<string> {
  const base = slugify(desired) || 'product';

  /*
   * One query rather than a probe per candidate. Fetching every slug in the family (`base`,
   * `base-2`, `base-17`) lets the suffix be chosen in memory, which matters when a merchant
   * bulk-imports two hundred products all called "T-Shirt".
   */
  const taken = await runner(executor).query<{ slug: string }>(
    `SELECT slug FROM (
       SELECT slug, id AS product_id FROM products WHERE store_id = $1
       UNION ALL
       SELECT slug, product_id FROM product_slug_history WHERE store_id = $1
     ) s
     WHERE (slug = $2 OR slug LIKE $2 || '-%')
       AND ($3::uuid IS NULL OR product_id IS DISTINCT FROM $3::uuid)`,
    [storeId, base, excludeProductId ?? null]
  );

  const used = new Set(taken.rows.map((r) => r.slug));
  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 10_000; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  /* Ten thousand collisions on one base means something is very wrong; a timestamp ends it. */
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Retire a slug so the storefront can redirect it.
 *
 * Safe to call when the slug did not actually change — it no-ops. Conflicts are ignored rather
 * than raised: a slug reappearing in history is not a reason to fail a merchant's save.
 *
 * @param storeId - The tenant.
 * @param productId - The product whose slug is being replaced.
 * @param previousSlug - The slug that is going out of service.
 * @param newSlug - The slug replacing it. Equal values make this a no-op.
 * @param executor - The transaction client, when called inside one.
 *
 *   Not optional in practice. Both callers change `products.slug` inside a transaction, and running
 *   this on the pool instead deadlocked the request in a way Postgres cannot detect and cannot
 *   break: the transaction's `UPDATE products` holds a row lock, this `INSERT` needs `FOR KEY SHARE`
 *   on that same row through its foreign key, and the two are on different connections — so the
 *   application waits on the database while the database waits on the application. The client
 *   giving up frees nothing; the connection stays idle-in-transaction holding the lock until the
 *   process dies, and a handful of renamed products exhausts the pool and stops every catalogue
 *   write in the store.
 */
export async function recordSlugChange(
  storeId: string,
  productId: string,
  previousSlug: string | null | undefined,
  newSlug: string,
  executor?: PoolClient | SlugExecutor
): Promise<void> {
  if (!previousSlug || previousSlug === newSlug) return;

  const run = runner(executor);

  await run.query(
    `INSERT INTO product_slug_history (store_id, product_id, slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (store_id, slug) DO NOTHING`,
    [storeId, productId, previousSlug]
  );

  /* The new slug may itself be a retired one being reclaimed by the same product. Clearing it
   * keeps the storefront from redirecting a live URL to itself. */
  await run.query('DELETE FROM product_slug_history WHERE store_id = $1 AND slug = $2', [
    storeId,
    newSlug
  ]);
}

/**
 * Resolve a slug that may be retired to the product that now owns it.
 *
 * @param storeId - The tenant.
 * @param slug - The slug from the incoming URL.
 * @param executor - The transaction client, when called inside one.
 * @returns The current slug to redirect to, or null when the slug is live or unknown.
 */
export async function resolveRetiredSlug(
  storeId: string,
  slug: string,
  executor?: PoolClient | SlugExecutor
): Promise<string | null> {
  const result = await runner(executor).query<{ slug: string }>(
    `SELECT p.slug
       FROM product_slug_history h
       JOIN products p ON p.id = h.product_id AND p.store_id = h.store_id
      WHERE h.store_id = $1 AND h.slug = $2
      LIMIT 1`,
    [storeId, slug]
  );

  return result.rows[0]?.slug ?? null;
}
