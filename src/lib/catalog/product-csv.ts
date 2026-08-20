/**
 * CSV import and export for a product catalogue.
 *
 * A 4,000-SKU distributor cannot enter their catalogue one form at a time, and
 * before this the only door into `products` was a ShipStation sync — which
 * excluded every merchant who does not ship through ShipStation and every
 * merchant with a spreadsheet.
 *
 * Deliberately dependency-free. A CSV parser is small, and the alternatives all
 * want a stream or a Node-only API that does not exist on the Edge runtime; the
 * parser here handles the parts of RFC 4180 that a real spreadsheet emits —
 * quoted fields, embedded commas, embedded newlines, and `""` as an escaped
 * quote — and nothing it does not.
 */

/** Columns exported, in order. Also the columns an import understands. */
export const CSV_COLUMNS = [
  'sku',
  'name',
  'slug',
  'short_description',
  'base_price',
  'sale_price',
  'stock_quantity',
  'category',
  'tags',
  'featured_image_url',
  'weight',
  'is_active',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/**
 * Quote one CSV field.
 *
 * Excel and Sheets both treat a leading `=`, `+`, `-` or `@` as the start of a
 * formula, so a product named `=cmd|...` becomes an executable cell when the
 * merchant opens their own export. Prefixing those with a single quote is the
 * standard defence and is invisible in the cell.
 *
 * @param value - The raw field value
 * @returns A CSV-safe field
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Render rows as a CSV document.
 * @param rows - Records keyed by column name
 * @param columns - Columns to emit, in order
 * @returns A CSV string with a header row and CRLF line endings
 */
export function toCsv(
  rows: readonly Record<string, unknown>[],
  columns: readonly string[] = CSV_COLUMNS,
): string {
  const header = columns.map(csvField).join(',');
  const body = rows.map((row) => columns.map((column) => csvField(row[column])).join(','));
  // CRLF, because Excel on Windows still treats a bare LF file as one line.
  return [header, ...body].join('\r\n');
}

/**
 * Parse a CSV document into rows keyed by header name.
 *
 * Tolerates a UTF-8 BOM (which Excel writes and which would otherwise make the
 * first header `\ufeff` + `sku`), CRLF or LF endings, and trailing blank lines.
 *
 * @param text - The CSV document
 * @returns One record per data row, keyed by trimmed lowercase header
 */
export function parseCsv(text: string): Record<string, string>[] {
  const input = text.replace(/^\ufeff/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      // Swallow; the \n that follows ends the row.
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  // The last row usually has no trailing newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return [];

  const headers = headerRow.map((header) => header.trim().toLowerCase());

  return dataRows
    // A trailing newline produces one empty row; so does a blank line in the
    // middle of a file a merchant edited by hand.
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells) => {
      const record: Record<string, string> = {};
      headers.forEach((header, position) => {
        record[header] = (cells[position] ?? '').trim();
      });
      return record;
    });
}

/** One row's worth of validated import data. */
export interface ImportRow {
  sku: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  basePrice: number;
  salePrice: number | null;
  stockQuantity: number;
  categoryName: string | null;
  tags: string[];
  featuredImageUrl: string | null;
  weight: number | null;
  isActive: boolean;
}

/** A row that could not be imported, with the reason. */
export interface ImportProblem {
  /** 1-based row number as the merchant sees it in their spreadsheet. */
  line: number;
  sku: string;
  message: string;
}

/**
 * Turn a slug candidate into a usable slug.
 * @param value - Free text
 * @returns A URL-safe slug, possibly empty
 */
function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
    .replace(/-+$/g, '');
}

/**
 * Read a boolean from the many things a spreadsheet calls one.
 * @param value - The raw cell
 * @param fallback - What an empty cell means
 * @returns The parsed boolean
 */
function parseBoolean(value: string, fallback: boolean): boolean {
  const text = value.trim().toLowerCase();
  if (text === '') return fallback;
  return ['true', 'yes', 'y', '1', 'active', 'live'].includes(text);
}

/**
 * Validate parsed CSV rows into importable products.
 *
 * Every row is checked independently and problems are collected rather than
 * thrown: a merchant importing 4,000 rows needs to know that rows 12 and 3,900
 * are wrong, not that "the import failed". Row numbers are 1-based **including
 * the header**, so they match what the spreadsheet shows.
 *
 * @param records - Rows from {@link parseCsv}
 * @returns The rows that can be imported, and the problems with the rest
 */
export function validateImport(records: readonly Record<string, string>[]): {
  rows: ImportRow[];
  problems: ImportProblem[];
} {
  const rows: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  const seenSkus = new Set<string>();
  const seenSlugs = new Set<string>();

  records.forEach((record, index) => {
    // +2: one for the header row, one because spreadsheets count from 1.
    const line = index + 2;
    const sku = (record.sku ?? '').trim();
    const name = (record.name ?? '').trim();

    if (!sku) {
      problems.push({ line, sku, message: 'Missing SKU' });
      return;
    }
    if (!name) {
      problems.push({ line, sku, message: 'Missing name' });
      return;
    }
    if (seenSkus.has(sku.toLowerCase())) {
      problems.push({ line, sku, message: `SKU "${sku}" appears more than once in this file` });
      return;
    }

    const basePrice = Number.parseFloat((record.base_price ?? '').replace(/[^0-9.\-]/g, ''));
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      problems.push({ line, sku, message: 'base_price must be a number of 0 or more' });
      return;
    }

    const saleRaw = (record.sale_price ?? '').replace(/[^0-9.\-]/g, '');
    const salePrice = saleRaw === '' ? null : Number.parseFloat(saleRaw);
    if (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0)) {
      problems.push({ line, sku, message: 'sale_price must be a number of 0 or more' });
      return;
    }

    let slug = slugify((record.slug ?? '').trim() || name);
    if (!slug) {
      problems.push({ line, sku, message: 'Could not build a URL slug from the name' });
      return;
    }
    // Two products called "Blue Mug" in one file would collide on slug and the
    // second insert would fail on a constraint the merchant cannot see. Make
    // the later one unique instead of rejecting the row.
    if (seenSlugs.has(slug)) slug = `${slug}-${sku.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;

    const stockRaw = (record.stock_quantity ?? '').replace(/[^0-9\-]/g, '');
    const stockQuantity = stockRaw === '' ? 0 : Number.parseInt(stockRaw, 10);

    const weightRaw = (record.weight ?? '').replace(/[^0-9.\-]/g, '');
    const weight = weightRaw === '' ? null : Number.parseFloat(weightRaw);

    seenSkus.add(sku.toLowerCase());
    seenSlugs.add(slug);

    rows.push({
      sku,
      name,
      slug,
      shortDescription: (record.short_description ?? '').trim() || null,
      basePrice,
      salePrice,
      stockQuantity: Number.isFinite(stockQuantity) ? Math.max(stockQuantity, 0) : 0,
      categoryName: (record.category ?? '').trim() || null,
      tags: (record.tags ?? '')
        .split(/[;|]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      featuredImageUrl: (record.featured_image_url ?? '').trim() || null,
      weight: weight !== null && Number.isFinite(weight) ? weight : null,
      isActive: parseBoolean(record.is_active ?? '', true),
    });
  });

  return { rows, problems };
}
