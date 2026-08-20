/**
 * Catalogue CSV import.
 *
 * The admin has had an "Import Products" modal with a file picker since the catalogue page was
 * written, pointed at a route that did not exist.
 *
 * A blind bulk import is a catastrophe generator, so this one is built around two rules.
 *
 * **Dry run first.** `?dry_run=true` validates the whole file and reports exactly what would happen
 * — how many products created, how many updated, which rows would fail and why — without writing
 * anything. The admin runs this before it runs the real thing, so a merchant sees the consequences
 * before committing to them rather than discovering them afterwards.
 *
 * **A blank cell means "leave this alone".** Not "set it to empty". A merchant who exports 800
 * products, edits one column and re-imports must not have every other field wiped because their
 * spreadsheet dropped a column. Emptying a field deliberately is what the edit form is for.
 *
 * A row that fails does not fail the file. Each row's outcome is reported with its line number, so
 * the merchant fixes eight rows rather than being told "import failed".
 */

import type { PoolClient } from 'pg';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';
import { mapColumns, parseCell, parseCsv, reconcilePrices } from '@/lib/catalog/csv';
import { uniqueProductSlug, recordSlugChange, slugify } from '@/lib/catalog/slug';

/** How many rows one file may carry. Beyond this the merchant should split the file. */
const MAX_ROWS = 10_000;

/** Largest upload accepted, before parsing. */
const MAX_BYTES = 20 * 1024 * 1024;

/** What happened to one row. */
interface RowOutcome {
  line: number;
  sku: string;
  handle: string;
  action: 'create' | 'update' | 'skip' | 'error';
  message?: string;
  fields?: string[];
}

/**
 * POST /api/admin/products/import
 *
 * Import or update products from a CSV.
 *
 * Accepts either a `multipart/form-data` upload with a `file` field, or a raw CSV body. Pass
 * `?dry_run=true` to validate without writing.
 *
 * @param request - The incoming request.
 * @returns A per-row report and a summary.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }
    const storeId = user.storeId;

    const dryRun = new URL(request.url).searchParams.get('dry_run') === 'true';

    const text = await readUpload(request);
    const rows = parseCsv(text);

    if (rows.length < 2) {
      throw new AdminApiError('That file has a header row but no products in it', 400);
    }
    if (rows.length - 1 > MAX_ROWS) {
      throw new AdminApiError(
        `That file has ${rows.length - 1} rows. Split it into files of ${MAX_ROWS} or fewer.`,
        413
      );
    }

    /*
     * Map the file's headers onto columns once, up front.
     *
     * Unrecognised headers are reported rather than ignored: a merchant whose "Price" column is
     * spelled in a way this importer does not know needs to be told, not left to discover that
     * their prices did not change.
     */
    const headers = rows[0];
    const { mapping, unrecognised, duplicates } = mapColumns(headers);

    const identity = mapping.find((m) => m.column.column === 'sku');
    const handleColumn = mapping.find((m) => m.column.column === 'slug');

    if (!identity && !handleColumn) {
      throw new AdminApiError(
        'That file needs a "Variant SKU" or "Handle" column so each row can be matched to a product',
        400
      );
    }

    if (mapping.length === (identity ? 1 : 0) + (handleColumn ? 1 : 0)) {
      throw new AdminApiError(
        `Nothing in that file can be imported. Recognised no data columns${
          unrecognised.length ? `; unrecognised: ${unrecognised.join(', ')}` : ''
        }.`,
        400
      );
    }

    const outcomes: RowOutcome[] = [];

    /*
     * The whole import runs in one transaction, and a dry run rolls it back.
     *
     * This is what makes the preview trustworthy: it exercises the real inserts, the real
     * constraints and the real uniqueness checks, rather than a simulation that could disagree with
     * what actually happens. A row that would violate a constraint fails in the dry run too.
     */
    /* Line number where each handle was first seen, so a repeat can name it. */
    const handlesSeen = new Map<string, number>();

    /* Category name to id, so a 5,000-row file resolves "Audio" once rather than 5,000 times. */
    const categoryCache = new Map<string, string>();

    await db.transaction(async (tx) => {
      for (let i = 1; i < rows.length; i++) {
        const line = i + 1;
        const cells = rows[i];

        const sku = identity ? (cells[identity.index] ?? '').trim() : '';
        const handle = handleColumn ? (cells[handleColumn.index] ?? '').trim() : '';

        if (!sku && !handle) {
          outcomes.push({ line, sku, handle, action: 'skip', message: 'No SKU or handle' });
          continue;
        }

        /*
         * A second row for a handle already seen is a variant, and this platform has no variants.
         *
         * Refusing it loudly is the only honest answer available until the variant model lands.
         * Overwriting the first row — what used to happen — produced a product with one variant's
         * SKU and another's price and barcode, which is a mis-pick in the warehouse. Creating three
         * unrelated products instead would silently restructure the merchant's catalogue. Saying
         * "this file describes variants and I cannot store them" is the one response that leaves
         * the merchant able to decide.
         */
        if (handle) {
          const seenAt = handlesSeen.get(handle);
          if (seenAt !== undefined) {
            outcomes.push({
              line,
              sku,
              handle,
              action: 'error',
              message:
                `Line ${line} is another variant of "${handle}" (first seen on line ${seenAt}). `
                + 'This platform stores one SKU per product and cannot yet hold variants, so this '
                + 'row was not imported. Give each variant its own Handle to import them as '
                + 'separate products.'
            });
            continue;
          }
          handlesSeen.set(handle, line);
        }

        /*
         * Each row gets a savepoint.
         *
         * Without one, the per-row `catch` below recorded an outcome and carried on while the
         * Postgres transaction was already aborted, so every subsequent statement came back
         * `current transaction is aborted, commands ignored until end of transaction block`. A
         * 10,000-row file with one duplicate SKU at row 12 discarded rows 13 to 10,000 and reported
         * each of them with that message — which is both useless to a merchant and the exact
         * opposite of the promise in this file's header, that one bad row does not fail the file.
         */
        await tx.query(`SAVEPOINT row_${i}`);

        try {
          /* The whole row, because the lock decision below compares each incoming cell against
           * what is stored. Selecting three columns and comparing against the rest made every
           * comparison "different" and claimed every field on every row. */
          const existing = await tx.query<
            Record<string, unknown> & { id: string; slug: string; sku: string }
          >(
            /*
             * SKU is the identity when the row has one; the handle only when it does not.
             *
             * This read `($2 <> '' AND sku = $2 OR $3 <> '' AND slug = $3)`, and `AND` binds
             * tighter than `OR`, so it meant `sku = $2 OR slug = $3` — either one matching was
             * enough. In a genuine Shopify export every variant row after the first carries the
             * *same Handle* and a *different SKU*, which is the format's whole premise, so every
             * variant matched the product created by row 1 and overwrote it. A three-variant tee
             * imported as one row holding the SKU of variant 1 and the price, barcode, cost and
             * weight of variant 3, reported as "2 created, 2 updated".
             *
             * The parentheses make SKU authoritative. `variantRowsForHandle` below then refuses the
             * extra rows outright rather than letting them create three unrelated products, because
             * silently splitting a merchant's variants into separate listings is its own kind of
             * wrong answer.
             */
            `SELECT * FROM products
              WHERE store_id = $1
                AND CASE WHEN $2 <> '' THEN sku = $2 ELSE $3 <> '' AND slug = $3 END
              LIMIT 1`,
            [storeId, sku, handle]
          );

          const values: unknown[] = [];
          const assignments: string[] = [];
          const applied: string[] = [];
          const locks: string[] = [];
          const current = existing.rows[0] as Record<string, unknown> | undefined;

          /*
           * The price pair is resolved together before the per-column loop, because Shopify's two
           * price columns mean the opposite of this platform's two and neither can be interpreted
           * without the other. Straight mapping made a genuine Shopify export fail every row on
           * `products_sale_price_not_above_base`.
           */
          const priceCell = cellFor(mapping, cells, 'base_price');
          const compareCell = cellFor(mapping, cells, 'sale_price');
          const prices = reconcilePrices(
            priceCell as number | undefined,
            compareCell as number | undefined
          );

          /*
           * A weight read from `Variant Grams` has already been converted to pounds, so the file's
           * own `Variant Weight Unit` must not be written beside it.
           *
           * It was. A 340 g mug imported as `weight = 0.75, weight_unit = 'g'` — a record saying
           * the mug weighs three quarters of a gram, which the storefront prints, the schema.org
           * `QuantitativeValue` publishes, and the public product API returns.
           */
          const gramsSupplied = mapping.some(
            (m) => m.column.type === 'grams' && (cells[m.index] ?? '').trim() !== ''
          );

          if (gramsSupplied) {
            values.push('lb');
            assignments.push(`weight_unit = $${values.length}`);
            applied.push('weight_unit');
          }

          for (const [priceColumn, priceValue] of Object.entries(prices)) {
            values.push(priceValue);
            assignments.push(`${priceColumn} = $${values.length}`);
            applied.push(priceColumn);
            if (
              current !== undefined &&
              !sameStoredValue(current[priceColumn], priceValue) &&
              SYNCED_FIELDS.includes(priceColumn)
            ) {
              locks.push(priceColumn);
            } else if (current === undefined && SYNCED_FIELDS.includes(priceColumn)) {
              locks.push(priceColumn);
            }
          }

          for (const { index, column } of mapping) {
            if (column.column === 'slug' || column.column === 'sku') continue;
            /* Handled above, as a pair. */
            if (column.column === 'base_price' || column.column === 'sale_price') continue;
            if (column.column === 'weight_unit' && gramsSupplied) continue;

            let parsed = parseCell(cells[index] ?? '', column.type);
            if (parsed === undefined) continue;

            /* A category arrives as a name and has to become an id. Created when it does not
             * exist, matching what the ShipStation sync already does. */
            if (column.type === 'category') {
              parsed = await resolveCategoryByName(tx, storeId, String(parsed), categoryCache);
              if (parsed === undefined) continue;
            }

            values.push(parsed);
            assignments.push(`${column.column} = $${values.length}`);
            applied.push(column.column!);

            /*
             * An imported value claims the field from ShipStation the same way a typed one does —
             * but only when it actually differs from what is stored.
             *
             * Locking every non-blank mapped cell meant exporting a catalogue and re-importing it
             * unchanged severed name, description, price, image and status on *every* product from
             * upstream forever. A no-op round trip is a thing merchants do routinely, to check a
             * file opens, and it must not be a destructive operation. The single-edit route
             * compares before locking for exactly this reason.
             */
            if (
              SYNCED_FIELDS.includes(column.column!) &&
              current !== undefined &&
              !sameStoredValue(current[column.column!], parsed)
            ) {
              locks.push(column.column!);
            } else if (SYNCED_FIELDS.includes(column.column!) && current === undefined) {
              /* A newly created product has nothing to compare against, and every value in the file
               * is the merchant's. */
              locks.push(column.column!);
            }
          }

          if (existing.rows.length > 0) {
            const product = existing.rows[0];

            if (assignments.length === 0) {
              outcomes.push({ line, sku, handle, action: 'skip', message: 'No changed fields' });
              continue;
            }

            /* A handle change on an existing product retires the old slug so links keep working. */
            let newSlug: string | null = null;
            if (handle && handle !== product.slug) {
              newSlug = await uniqueProductSlug(storeId, handle, product.id, tx);
              values.push(newSlug);
              assignments.push(`slug = $${values.length}`);
              applied.push('slug');
            }

            values.push(product.id, storeId);
            await tx.query(
              `UPDATE products SET ${assignments.join(', ')}, updated_at = NOW()
                WHERE id = $${values.length - 1} AND store_id = $${values.length}`,
              values
            );

            if (locks.length > 0) {
              await tx.query('SELECT lock_product_fields($1, $2, $3::text[])', [
                storeId,
                product.id,
                locks
              ]);
            }

            if (newSlug) {
              await recordSlugChange(storeId, product.id, product.slug, newSlug, tx);
            }

            outcomes.push({ line, sku: product.sku, handle, action: 'update', fields: applied });
            continue;
          }

          /* Creating. A new product needs an identity and a name; everything else may be filled in
           * later, which is what draft status is for. */
          const nameIndex = mapping.find((m) => m.column.column === 'name')?.index;
          const name = nameIndex !== undefined ? (cells[nameIndex] ?? '').trim() : '';
          if (!name) {
            outcomes.push({
              line,
              sku,
              handle,
              action: 'error',
              message: 'New products need a Title'
            });
            continue;
          }

          const newSku = sku || `${slugify(name).toUpperCase().slice(0, 20) || 'SKU'}-${line}`;
          const slug = await uniqueProductSlug(storeId, handle || name, undefined, tx);

          const columns = ['store_id', 'sku', 'slug', 'field_locks'];
          const insertValues: unknown[] = [storeId, newSku, slug, locks];

          /* A grams column has already been converted to pounds; the file's own unit must not be
           * written beside it. Same reasoning as the update path above. */
          if (gramsSupplied) {
            columns.push('weight_unit');
            insertValues.push('lb');
          }

          /* The same crosswise price resolution the update path uses. Applied here too because a
           * Shopify export's first import is a *create*, which is precisely the case that failed
           * every row on `products_sale_price_not_above_base`. */
          for (const [priceColumn, priceValue] of Object.entries(prices)) {
            if (priceValue === null || priceValue === undefined) continue;
            columns.push(priceColumn);
            insertValues.push(priceValue);
          }

          for (const { index, column } of mapping) {
            if (column.column === 'slug' || column.column === 'sku') continue;
            if (column.column === 'base_price' || column.column === 'sale_price') continue;
            if (column.column === 'weight_unit' && gramsSupplied) continue;
            let parsed = parseCell(cells[index] ?? '', column.type);
            if (parsed === undefined) continue;
            if (column.type === 'category') {
              parsed = await resolveCategoryByName(tx, storeId, String(parsed), categoryCache);
              if (parsed === undefined) continue;
            }
            columns.push(column.column!);
            insertValues.push(parsed);
          }

          /* `base_price` is NOT NULL, so a row that did not carry a price still needs one. Zero and
           * draft, rather than a guess: an unpriced product must not go on sale by accident. */
          if (!columns.includes('base_price')) {
            columns.push('base_price');
            insertValues.push(0);
          }
          if (!columns.includes('status')) {
            columns.push('status');
            insertValues.push('draft');
          }

          await tx.query(
            `INSERT INTO products (${columns.join(', ')})
             VALUES (${insertValues.map((_, n) => `$${n + 1}`).join(', ')})`,
            insertValues
          );

          outcomes.push({ line, sku: newSku, handle: slug, action: 'create', fields: columns });
          await tx.query(`RELEASE SAVEPOINT row_${i}`);
        } catch (error) {
          /* Undo just this row, leaving the transaction usable for the next one. */
          await tx.query(`ROLLBACK TO SAVEPOINT row_${i}`);
          /*
           * One bad row does not fail the file. The message is the database's own where it is
           * useful to a merchant — "duplicate key" on a SKU tells them exactly what to fix — and
           * generic where it is not.
           */
          const message =
            error instanceof AdminApiError
              ? error.message
              : error instanceof Error && /duplicate key/i.test(error.message)
                ? 'A different product already uses that SKU or handle'
                : error instanceof Error
                  ? error.message.split('\n')[0].slice(0, 200)
                  : 'Could not import this row';
          outcomes.push({ line, sku, handle, action: 'error', message });
        }
      }

      if (dryRun) {
        /* Everything above ran against the real schema; none of it is kept. */
        throw new DryRunComplete();
      }
    }).catch((error) => {
      if (!(error instanceof DryRunComplete)) throw error;
    });

    const summary = {
      rows: rows.length - 1,
      created: outcomes.filter((o) => o.action === 'create').length,
      updated: outcomes.filter((o) => o.action === 'update').length,
      skipped: outcomes.filter((o) => o.action === 'skip').length,
      failed: outcomes.filter((o) => o.action === 'error').length
    };

    return NextResponse.json({
      success: true,
      data: {
        dry_run: dryRun,
        summary,
        unrecognised_columns: unrecognised,
        /* Headers dropped because an earlier column already writes that field — a Shopify export's
         * `Published` beside its `Status`, for instance. Said out loud so a merchant is not left
         * wondering why one of their columns had no effect. */
        duplicate_columns: duplicates,
        /* Errors first: they are the rows the merchant has to act on. */
        results: [
          ...outcomes.filter((o) => o.action === 'error'),
          ...outcomes.filter((o) => o.action !== 'error')
        ].slice(0, 500),
        message: dryRun
          ? `Preview only — nothing was saved. ${summary.created} would be created, ${summary.updated} updated${
              summary.failed ? `, ${summary.failed} would fail` : ''
            }.`
          : `${summary.created} created, ${summary.updated} updated${
              summary.failed ? `, ${summary.failed} failed` : ''
            }.`
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'products.import');
  }
}

/** Thrown to roll a dry run back once every row has been exercised. */
class DryRunComplete extends Error {}

/**
 * Read the uploaded CSV, from either a form upload or a raw body.
 *
 * @param request - The incoming request.
 * @returns The file's text.
 * @throws AdminApiError when nothing usable was sent.
 */
async function readUpload(request: NextRequest): Promise<string> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new AdminApiError('Choose a CSV file to import', 400);
    }
    if (file.size > MAX_BYTES) {
      throw new AdminApiError('That file is larger than 20MB. Split it and import in parts.', 413);
    }
    return file.text();
  }

  const body = await request.text();
  if (!body.trim()) {
    throw new AdminApiError('Choose a CSV file to import', 400);
  }
  if (body.length > MAX_BYTES) {
    throw new AdminApiError('That file is larger than 20MB. Split it and import in parts.', 413);
  }
  return body;
}

/** The fields the ShipStation sync also writes, and so the only ones worth claiming. */
const SYNCED_FIELDS = [
  'name',
  'short_description',
  'base_price',
  'featured_image_url',
  'status',
  'category_id',
  'sku'
];

/**
 * Whether an imported cell matches what is already stored.
 *
 * Compared loosely on purpose. A price arrives from Postgres as the string `"249.00"` and from the
 * file as the number `249`; a strict comparison would call those different and claim the field,
 * which is the defect this exists to prevent. Arrays compare element-wise so tag order is
 * significant — reordering tags *is* an edit.
 *
 * @param stored - The value currently in the database.
 * @param incoming - The parsed cell.
 * @returns Whether they mean the same thing.
 */
function sameStoredValue(stored: unknown, incoming: unknown): boolean {
  if (stored === null || stored === undefined) {
    return incoming === null || incoming === undefined || incoming === '';
  }

  if (Array.isArray(stored) || Array.isArray(incoming)) {
    const a = Array.isArray(stored) ? stored.map(String) : [String(stored)];
    const b = Array.isArray(incoming) ? incoming.map(String) : [String(incoming)];
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  if (typeof incoming === 'number' || typeof stored === 'number') {
    const a = Number(stored);
    const b = Number(incoming);
    if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  }

  if (typeof incoming === 'boolean' || typeof stored === 'boolean') {
    return Boolean(stored) === Boolean(incoming);
  }

  return String(stored).trim() === String(incoming).trim();
}

/**
 * Parse the cell a given column is mapped to, if the file has one.
 *
 * @param mapping - The resolved header mapping.
 * @param cells - One row.
 * @param column - The database column wanted.
 * @returns The parsed value, or undefined when the column is absent or the cell is blank.
 */
function cellFor(
  mapping: Array<{ index: number; column: { column: string | null; type: string } }>,
  cells: string[],
  column: string
): unknown {
  const found = mapping.find((m) => m.column.column === column);
  if (!found) return undefined;
  return parseCell(cells[found.index] ?? '', found.column.type as Parameters<typeof parseCell>[1]);
}

/**
 * Turn a category name from a spreadsheet into a category id, creating it when it is new.
 *
 * Matching is case-insensitive on the trimmed name: a merchant who types "audio" where the
 * catalogue says "Audio" means the same category, and creating a near-duplicate would fragment
 * their taxonomy silently.
 *
 * @param tx - The transaction client, so a rolled-back dry run does not leave categories behind.
 * @param storeId - The tenant.
 * @param name - The name from the file.
 * @param cache - Name-to-id memo for the duration of one import.
 * @returns The category id, or undefined when the cell was blank.
 */
async function resolveCategoryByName(
  tx: PoolClient,
  storeId: string,
  name: string,
  cache: Map<string, string>
): Promise<string | undefined> {
  const clean = name.trim();
  if (!clean) return undefined;

  const key = clean.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = await tx.query<{ id: string }>(
    'SELECT id FROM categories WHERE store_id = $1 AND LOWER(name) = $2 LIMIT 1',
    [storeId, key]
  );

  let id = existing.rows[0]?.id;
  if (!id) {
    const created = await tx.query<{ id: string }>(
      `INSERT INTO categories (store_id, name, slug, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id`,
      [storeId, clean, await uniqueCategorySlug(tx, storeId, clean)]
    );
    id = created.rows[0].id;
  }

  cache.set(key, id);
  return id;
}

/**
 * A category slug free within the store.
 *
 * `categories` has a unique slug per store, and two differently-named categories can normalise to
 * the same slug ("Home & Garden" and "Home and Garden"). Without this the second one fails the row.
 *
 * @param tx - The transaction client.
 * @param storeId - The tenant.
 * @param name - The category name.
 * @returns A free slug.
 */
async function uniqueCategorySlug(
  tx: PoolClient,
  storeId: string,
  name: string
): Promise<string> {
  const base = slugify(name) || 'category';
  const taken = await tx.query<{ slug: string }>(
    `SELECT slug FROM categories WHERE store_id = $1 AND (slug = $2 OR slug LIKE $2 || '-%')`,
    [storeId, base]
  );
  const used = new Set(taken.rows.map((r) => r.slug));
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    if (!used.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
