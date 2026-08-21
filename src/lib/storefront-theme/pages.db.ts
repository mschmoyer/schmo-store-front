/**
 * Persistence for custom storefront pages.
 *
 * Mirrors `db.ts` deliberately: one row per (store, slug, status), with draft
 * and published coexisting. A merchant who has learned how publishing works on
 * their home page already knows how it works on every other page.
 *
 * **Unlike `db.ts`, nothing here is cached, and that is deliberate.** An
 * in-process cache cannot be invalidated across instances — the invalidate call
 * only reaches the module registry it runs in, which on a serverless platform
 * is one lambda out of many. The symptom was reproducible and bad: publish a
 * page, open its URL, and get a 404; publish a policy page and watch the footer
 * not list it. Serving a stale *theme* is a cosmetic problem for a minute;
 * serving a 404 for a page that exists is a broken shop, at exactly the moment
 * the merchant is looking at it.
 *
 * What it buys instead is one indexed lookup per storefront render, on a page
 * that already queries the store, the theme, the categories and the catalogue.
 * Correctness is worth more than that query.
 *
 * **Every query in this file carries `store_id`.** Pages are addressed by a
 * merchant-chosen slug, which is the most guessable identifier on the platform:
 * `about` exists on thousands of stores. A lookup keyed on slug alone would
 * serve one merchant's unpublished draft to another merchant's shopper.
 */

import { db } from '@/lib/database';

import { normalizeSections } from './sections';
import type { PageSeo, StorePage, StorePageSummary } from './pages';
import type { Section } from './types';

export type PageStatus = 'draft' | 'published';

export interface StorePageRecord extends StorePage {
  storeId: string;
  status: PageStatus;
  version: number;
  updatedAt: Date | null;
  publishedAt: Date | null;
}

interface PageRow extends Record<string, unknown> {
  store_id: string;
  slug: string;
  status: PageStatus;
  title: string;
  sections: unknown;
  seo: unknown;
  version: number | string;
  updated_at: Date | null;
  published_at: Date | null;
}

const SELECT_COLUMNS =
  'store_id, slug, status, title, sections, seo, version, updated_at, published_at';

/* ------------------------------------------------------------------ *
 * Row mapping
 * ------------------------------------------------------------------ */

/**
 * Parse a JSONB column that may arrive as an object or as a string.
 * @param value - Raw column value
 * @returns The parsed value, or undefined when unusable
 */
function parseJson(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

/**
 * Convert a database row into a page record.
 *
 * Sections go through `normalizeSections`, so a page written by a newer build
 * that used a section type this build does not know renders the sections it
 * does know rather than throwing — the same contract the home page has.
 *
 * @param row - Raw row
 * @returns A typed page record
 */
function toRecord(row: PageRow): StorePageRecord {
  const { sections } = normalizeSections(parseJson(row.sections) ?? []);
  return {
    storeId: row.store_id,
    slug: row.slug,
    status: row.status,
    title: row.title,
    sections,
    seo: (parseJson(row.seo) ?? {}) as PageSeo,
    version: Number(row.version) || 1,
    updatedAt: row.updated_at ?? null,
    publishedAt: row.published_at ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/**
 * Every published page for a store, alphabetically by slug.
 *
 * On the storefront's hot path — the footer lists policy pages on every render —
 * so it is cached in-process and invalidated on publish and delete.
 *
 * @param storeId - Store UUID
 * @returns The store's published pages, empty when it has none
 */
export async function getPublishedPages(storeId: string): Promise<StorePageRecord[]> {
  if (!storeId) return [];

  const result = await db.query<PageRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM store_pages
      WHERE store_id = $1 AND status = 'published'
      ORDER BY slug ASC`,
    [storeId],
  );
  return result.rows.map(toRecord);
}

/**
 * One published page by slug.
 *
 * @param storeId - Store UUID
 * @param slug - Page slug
 * @returns The published page, or null when it does not exist or is unpublished
 */
export async function getPublishedPage(
  storeId: string,
  slug: string,
): Promise<StorePageRecord | null> {
  if (!storeId || !slug) return null;

  const result = await db.query<PageRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM store_pages
      WHERE store_id = $1 AND slug = $2 AND status = 'published'
      LIMIT 1`,
    [storeId, slug],
  );
  return result.rows[0] ? toRecord(result.rows[0]) : null;
}

/**
 * Every draft page for a store, for the editor's page list.
 *
 * Never cached: the editor must always see exactly what it just saved.
 *
 * @param storeId - Store UUID
 * @returns The store's draft pages, ordered by title
 */
export async function getDraftPages(storeId: string): Promise<StorePageRecord[]> {
  if (!storeId) return [];
  const result = await db.query<PageRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM store_pages
      WHERE store_id = $1 AND status = 'draft'
      ORDER BY title ASC`,
    [storeId],
  );
  return result.rows.map(toRecord);
}

/**
 * One draft page by slug.
 * @param storeId - Store UUID
 * @param slug - Page slug
 * @returns The draft page, or null
 */
export async function getDraftPage(
  storeId: string,
  slug: string,
): Promise<StorePageRecord | null> {
  if (!storeId || !slug) return null;
  const result = await db.query<PageRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM store_pages
      WHERE store_id = $1 AND slug = $2 AND status = 'draft'
      LIMIT 1`,
    [storeId, slug],
  );
  return result.rows[0] ? toRecord(result.rows[0]) : null;
}

/**
 * The editor's page list: one entry per draft slug, flagged with whether a
 * published row exists.
 *
 * @param storeId - Store UUID
 * @returns Summaries without the section payloads
 */
export async function listPageSummaries(storeId: string): Promise<StorePageSummary[]> {
  if (!storeId) return [];
  const result = await db.query<{
    slug: string;
    title: string;
    section_count: string;
    published: boolean;
    updated_at: Date | null;
  }>(
    `SELECT d.slug,
            d.title,
            jsonb_array_length(d.sections) AS section_count,
            EXISTS (
              SELECT 1 FROM store_pages p
               WHERE p.store_id = d.store_id AND p.slug = d.slug AND p.status = 'published'
            ) AS published,
            d.updated_at
       FROM store_pages d
      WHERE d.store_id = $1 AND d.status = 'draft'
      ORDER BY d.title ASC`,
    [storeId],
  );

  return result.rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    sectionCount: Number(row.section_count) || 0,
    published: row.published,
    updatedAt: (row.updated_at ?? new Date()).toISOString(),
  }));
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/**
 * Create a draft page, or fail if the slug is taken.
 *
 * Returns null on a slug collision rather than throwing, because a collision is
 * an ordinary thing for a merchant to do and the editor turns it into a field
 * error. A genuine database failure still throws.
 *
 * @param storeId - Store UUID
 * @param page - Slug, title, and optionally a starter composition
 * @returns The created draft, or null when the slug is already used
 */
export async function createPage(
  storeId: string,
  page: { slug: string; title: string; sections?: Section[]; seo?: PageSeo },
): Promise<StorePageRecord | null> {
  if (!storeId) throw new Error('createPage requires a storeId');

  const result = await db.query<PageRow>(
    `INSERT INTO store_pages (store_id, slug, status, title, sections, seo)
     VALUES ($1, $2, 'draft', $3, $4::jsonb, $5::jsonb)
     ON CONFLICT (store_id, slug, status) DO NOTHING
     RETURNING ${SELECT_COLUMNS}`,
    [
      storeId,
      page.slug,
      page.title,
      JSON.stringify(page.sections ?? []),
      JSON.stringify(page.seo ?? {}),
    ],
  );

  return result.rows[0] ? toRecord(result.rows[0]) : null;
}

/**
 * Update a draft page. Absent fields are left alone.
 *
 * The slug is not updatable — see `updatePageBodySchema` in `pages.ts` for why.
 *
 * @param storeId - Store UUID
 * @param slug - Page to update
 * @param patch - Fields to change
 * @returns The updated draft, or null when the page does not exist
 */
export async function updatePage(
  storeId: string,
  slug: string,
  patch: { title?: string; sections?: Section[]; seo?: PageSeo },
): Promise<StorePageRecord | null> {
  if (!storeId) throw new Error('updatePage requires a storeId');

  const result = await db.query<PageRow>(
    `UPDATE store_pages
        SET title      = COALESCE($3, title),
            sections   = COALESCE($4::jsonb, sections),
            seo        = COALESCE($5::jsonb, seo),
            version    = version + 1,
            updated_at = NOW()
      WHERE store_id = $1 AND slug = $2 AND status = 'draft'
      RETURNING ${SELECT_COLUMNS}`,
    [
      storeId,
      slug,
      patch.title ?? null,
      patch.sections === undefined ? null : JSON.stringify(patch.sections),
      patch.seo === undefined ? null : JSON.stringify(patch.seo),
    ],
  );

  return result.rows[0] ? toRecord(result.rows[0]) : null;
}

/**
 * Copy one page's draft over its published row, in one statement.
 *
 * @param storeId - Store UUID
 * @param slug - Page to publish
 * @returns The published record, or null when there is no draft to publish
 */
export async function publishPage(
  storeId: string,
  slug: string,
): Promise<StorePageRecord | null> {
  if (!storeId) throw new Error('publishPage requires a storeId');

  const result = await db.query<PageRow>(
    `INSERT INTO store_pages (store_id, slug, status, title, sections, seo, published_at)
     SELECT store_id, slug, 'published', title, sections, seo, NOW()
       FROM store_pages
      WHERE store_id = $1 AND slug = $2 AND status = 'draft'
     ON CONFLICT (store_id, slug, status) DO UPDATE
        SET title        = EXCLUDED.title,
            sections     = EXCLUDED.sections,
            seo          = EXCLUDED.seo,
            version      = store_pages.version + 1,
            updated_at   = NOW(),
            published_at = NOW()
     RETURNING ${SELECT_COLUMNS}`,
    [storeId, slug],
  );

  return result.rows[0] ? toRecord(result.rows[0]) : null;
}

/**
 * Unpublish a page: remove the published row, keep the draft.
 *
 * The merchant's work survives — taking a page off the shop is not the same
 * decision as throwing it away, and conflating them loses copy people wrote.
 *
 * @param storeId - Store UUID
 * @param slug - Page to unpublish
 * @returns True when a published row was removed
 */
export async function unpublishPage(storeId: string, slug: string): Promise<boolean> {
  if (!storeId) throw new Error('unpublishPage requires a storeId');
  const result = await db.query(
    `DELETE FROM store_pages WHERE store_id = $1 AND slug = $2 AND status = 'published'`,
    [storeId, slug],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Delete a page entirely — both its draft and its published row.
 *
 * @param storeId - Store UUID
 * @param slug - Page to delete
 * @returns True when anything was deleted
 */
export async function deletePage(storeId: string, slug: string): Promise<boolean> {
  if (!storeId) throw new Error('deletePage requires a storeId');
  const result = await db.query(
    `DELETE FROM store_pages WHERE store_id = $1 AND slug = $2`,
    [storeId, slug],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * How many pages a store already has, for enforcing `MAX_PAGES_PER_STORE`.
 * Counts distinct slugs, so a published page is not counted twice.
 *
 * @param storeId - Store UUID
 * @returns The store's page count
 */
export async function countPages(storeId: string): Promise<number> {
  if (!storeId) return 0;
  const result = await db.query<{ count: string }>(
    'SELECT COUNT(DISTINCT slug) AS count FROM store_pages WHERE store_id = $1',
    [storeId],
  );
  return Number(result.rows[0]?.count) || 0;
}
