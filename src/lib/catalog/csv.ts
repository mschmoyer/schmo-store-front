/**
 * The catalogue's CSV contract: one column list, used by both export and import.
 *
 * Merchants live in spreadsheets. Export is how they bulk-edit, how they hand a price list to a
 * colleague, and how they get their data out of a platform they are evaluating — so a round trip
 * has to be lossless. That is only true if export and import agree on the columns, which is why
 * they are defined once here rather than in each route.
 *
 * The header names deliberately match Shopify's where a Shopify column exists ("Handle", "Title",
 * "Vendor", "Variant SKU", "Variant Price"). A merchant migrating in can export from Shopify and
 * import here with no remapping, and one migrating out gets a file their next platform accepts.
 * Compatibility with the format everyone already has beats a tidier scheme of our own.
 */

/** One column of the catalogue CSV. */
export interface CsvColumn {
  /** The header a merchant sees, and what an import matches on. */
  header: string;
  /** The database column, or null for a computed column that export writes and import ignores. */
  column: string | null;
  /** How an imported value is converted before it reaches the column. */
  type: 'text' | 'number' | 'integer' | 'boolean' | 'list' | 'status';
  /** Alternative headers accepted on import, for files from elsewhere. */
  aliases?: string[];
  /** Computed columns are informational: export writes them, import must not try to store them. */
  readOnly?: boolean;
}

/**
 * The catalogue CSV columns, in the order they appear in an exported file.
 *
 * `Handle` first because it is the identity column both ways: on import it decides whether a row
 * updates an existing product or creates one.
 */
export const CATALOG_CSV_COLUMNS: CsvColumn[] = [
  { header: 'Handle', column: 'slug', type: 'text', aliases: ['slug', 'url'] },
  { header: 'Title', column: 'name', type: 'text', aliases: ['name', 'product'] },
  { header: 'Variant SKU', column: 'sku', type: 'text', aliases: ['sku', 'code'] },
  { header: 'Variant Barcode', column: 'barcode', type: 'text', aliases: ['barcode', 'gtin', 'upc', 'ean'] },
  { header: 'Vendor', column: 'vendor', type: 'text', aliases: ['brand', 'manufacturer'] },
  { header: 'Type', column: 'product_type', type: 'text', aliases: ['product type', 'product_type'] },
  { header: 'Tags', column: 'tags', type: 'list', aliases: ['tag'] },
  { header: 'Status', column: 'status', type: 'status', aliases: ['published', 'active'] },

  { header: 'Body (Short)', column: 'short_description', type: 'text', aliases: ['short description'] },
  { header: 'Body (HTML)', column: 'long_description', type: 'text', aliases: ['description', 'body'] },

  { header: 'Variant Price', column: 'base_price', type: 'number', aliases: ['price', 'base price'] },
  { header: 'Variant Compare At Price', column: 'sale_price', type: 'number', aliases: ['sale price', 'compare at price'] },
  { header: 'Cost per item', column: 'cost_price', type: 'number', aliases: ['cost', 'cost price', 'unit cost'] },

  { header: 'Variant Inventory Tracker', column: 'track_inventory', type: 'boolean', aliases: ['track inventory'] },
  /* Stock is exported for reference and refused on import: a quantity in a spreadsheet cannot say
   * why it changed, and stock only moves through the ledger with a reason attached. */
  { header: 'Variant Inventory Qty', column: null, type: 'integer', readOnly: true },
  { header: 'Low Stock Threshold', column: 'low_stock_threshold', type: 'integer', aliases: ['low stock'] },
  { header: 'Reorder Point', column: 'reorder_point', type: 'integer', aliases: ['reorder point'] },
  { header: 'Reorder Quantity', column: 'reorder_quantity', type: 'integer', aliases: ['reorder qty'] },
  { header: 'Lead Time Days', column: 'lead_time_days', type: 'integer', aliases: ['lead time'] },
  { header: 'Variant Requires Shipping', column: 'requires_shipping', type: 'boolean' },

  { header: 'Variant Grams', column: 'weight', type: 'number', aliases: ['weight'] },
  { header: 'Variant Weight Unit', column: 'weight_unit', type: 'text' },
  { header: 'Length', column: 'length', type: 'number' },
  { header: 'Width', column: 'width', type: 'number' },
  { header: 'Height', column: 'height', type: 'number' },
  { header: 'Dimension Unit', column: 'dimension_unit', type: 'text' },
  { header: 'HS Code', column: 'hs_code', type: 'text', aliases: ['harmonized code'] },
  { header: 'Country of Origin', column: 'country_of_origin', type: 'text', aliases: ['country'] },

  { header: 'Image Src', column: 'featured_image_url', type: 'text', aliases: ['image', 'image url'] },
  { header: 'SEO Title', column: 'meta_title', type: 'text', aliases: ['meta title'] },
  { header: 'SEO Description', column: 'meta_description', type: 'text', aliases: ['meta description'] },

  /* Computed. Present so an exported file answers the questions a merchant opens it to ask, and
   * ignored on import because nothing can be written to them. */
  { header: 'Category', column: null, type: 'text', readOnly: true },
  { header: 'Supplier', column: null, type: 'text', readOnly: true },
  { header: 'Available', column: null, type: 'integer', readOnly: true },
  { header: 'Committed', column: null, type: 'integer', readOnly: true },
  { header: 'Incoming', column: null, type: 'integer', readOnly: true },
  { header: 'Stock Value At Cost', column: null, type: 'number', readOnly: true },
  { header: 'Units Sold 90d', column: null, type: 'integer', readOnly: true },
  { header: 'Days Of Cover', column: null, type: 'number', readOnly: true },
  { header: 'Margin %', column: null, type: 'number', readOnly: true },
  { header: 'Listing Completeness', column: null, type: 'integer', readOnly: true }
];

/** Headers an import will accept, mapped to the column they write. */
const HEADER_LOOKUP = new Map<string, CsvColumn>();
for (const col of CATALOG_CSV_COLUMNS) {
  HEADER_LOOKUP.set(normaliseHeader(col.header), col);
  for (const alias of col.aliases ?? []) {
    HEADER_LOOKUP.set(normaliseHeader(alias), col);
  }
}

/**
 * Reduce a header to a form that matches regardless of case, spacing or punctuation.
 *
 * Spreadsheets acquire trailing spaces, smart quotes and stray underscores as they are passed
 * around. Refusing a file because a header says `Variant  SKU` rather than `Variant SKU` would be
 * pedantry at the merchant's expense.
 *
 * @param header - A raw header cell.
 * @returns The normalised key.
 */
export function normaliseHeader(header: string): string {
  return String(header ?? '')
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

/**
 * Find the column an imported header writes to.
 *
 * @param header - A raw header cell from the uploaded file.
 * @returns The column definition, or undefined when the header is not recognised.
 */
export function columnForHeader(header: string): CsvColumn | undefined {
  return HEADER_LOOKUP.get(normaliseHeader(header));
}

/**
 * Quote a value for CSV.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with an apostrophe. Excel and Sheets treat a cell
 * starting with those as a *formula*, so a product legitimately named `-40% Cable` becomes an
 * expression, and a malicious one named `=cmd|...` becomes a command the merchant's spreadsheet
 * offers to run. Neutralising it here costs one character and closes CSV injection.
 *
 * @param value - Any cell value.
 * @returns The value, quoted and escaped.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text = Array.isArray(value) ? value.join(', ') : String(value);

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Turn a row of values into a CSV line.
 *
 * @param values - The cells, already in column order.
 * @returns One CSV record, without a trailing newline.
 */
export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

/**
 * Parse CSV text into rows of cells.
 *
 * Hand-written rather than pulled from a dependency because the requirement is small and exact:
 * quoted fields, escaped quotes inside them, and newlines inside quoted fields — which is the case
 * a `split('\n')` implementation gets wrong, and product descriptions contain newlines constantly.
 *
 * @param text - The whole file.
 * @returns Rows of cells, with empty trailing lines dropped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  /* Strip a UTF-8 BOM, which Excel writes and which would otherwise become part of the first
   * header — making the identity column unrecognisable in every file Excel produces. */
  const input = text.replace(/^﻿/, '');

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      /* Accept CRLF, LF and lone CR. */
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * Convert a CSV cell to the type its column expects.
 *
 * @param raw - The cell text.
 * @param type - The column's type.
 * @returns The value to bind, or undefined when the cell is blank.
 * @throws Error with a message naming what was wrong, for the import's per-row report.
 */
export function parseCell(raw: string, type: CsvColumn['type']): unknown {
  const text = String(raw ?? '').trim();

  /* A blank cell means "leave this alone", not "set it to nothing". Clearing a field on import
   * because a column happened to be empty in one row would delete data the merchant never touched.
   * Explicit emptying is what the edit form is for. */
  if (text === '') return undefined;

  switch (type) {
    case 'number': {
      const value = Number(text.replace(/[^0-9.\-]/g, ''));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`"${text}" is not a price or measurement`);
      }
      return value;
    }
    case 'integer': {
      const value = Math.trunc(Number(text.replace(/[^0-9.\-]/g, '')));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`"${text}" is not a whole number of 0 or more`);
      }
      return value;
    }
    case 'boolean': {
      const lower = text.toLowerCase();
      if (['true', 'yes', 'y', '1', 'shopify', 'tracked'].includes(lower)) return true;
      if (['false', 'no', 'n', '0', '', 'none', 'untracked'].includes(lower)) return false;
      throw new Error(`"${text}" is not yes or no`);
    }
    case 'status': {
      const lower = text.toLowerCase();
      if (['active', 'true', 'yes', 'published'].includes(lower)) return 'active';
      if (['draft', 'false', 'no', 'unpublished'].includes(lower)) return 'draft';
      if (['archived', 'archive'].includes(lower)) return 'archived';
      throw new Error(`"${text}" is not active, draft or archived`);
    }
    case 'list':
      return text
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    case 'text':
    default:
      return text;
  }
}
