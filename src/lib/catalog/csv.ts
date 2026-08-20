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
  type: 'text' | 'number' | 'integer' | 'boolean' | 'list' | 'status' | 'grams';
  /** Alternative headers accepted on import, for files from elsewhere. */
  aliases?: string[];
  /** Computed columns are informational: export writes them, import must not try to store them. */
  readOnly?: boolean;
  /**
   * Accepted on import, never written on export.
   *
   * For headers other platforms use for a field this one already exports under its own name —
   * Shopify's `Published` beside its `Status`, or a plain `Weight` beside `Variant Grams`. Emitting
   * both would put two columns for one field in our own file, and re-importing it would then report
   * one of them as a dropped duplicate.
   */
  importOnly?: boolean;
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
  /* `published` is deliberately NOT an alias. A genuine Shopify export carries *both* a `Published`
   * (TRUE/FALSE) column and a `Status` (active/draft) column; mapping both here put `status` in the
   * generated UPDATE twice and every row failed with `column "status" specified more than once`.
   * `mapColumns` also refuses a second header for a column that is already mapped, so an export
   * from somewhere else that uses a different pair cannot reintroduce it. */
  { header: 'Status', column: 'status', type: 'status', aliases: ['active'] },
  { header: 'Published', column: 'status', type: 'status', importOnly: true },

  { header: 'Body (Short)', column: 'short_description', type: 'text', aliases: ['short description'] },
  { header: 'Body (HTML)', column: 'long_description', type: 'text', aliases: ['description', 'body'] },

  /*
   * Shopify's two price columns mean the opposite of the two here, and mapping them across
   * one-for-one inverted every product.
   *
   * In a Shopify file `Variant Price` is what the shopper pays and `Variant Compare At Price` is
   * the struck-through higher price. Here `base_price` is the regular price and `sale_price` is the
   * discount, so `effective_price` is `COALESCE(sale_price, base_price)`. Mapping Price→base and
   * Compare→sale therefore sold a 19.99 product for 29.99 in one direction, and in the other hit
   * `products_sale_price_not_above_base` and failed every row of a genuine Shopify export.
   *
   * `reconcilePrices` handles the pair on import and the export writes them back in Shopify's
   * terms, so a file leaves and returns meaning the same thing on both platforms. The `column`
   * fields below are the ones the pair resolves to, and are what `mapColumns` uses to keep each
   * field mapped once.
   */
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

  /* Shopify's column is grams; a product here defaults to `weight_unit = 'lb'`. Importing 250 as
   * 250 lb then drives shipping rates and the customs value on a commercial invoice, so the header
   * carries its unit and the import converts. `Weight` with no unit is taken at face value. */
  { header: 'Variant Grams', column: 'weight', type: 'grams' },
  { header: 'Weight', column: 'weight', type: 'number', aliases: ['variant weight'], importOnly: true },
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
  /* Exact headers win over aliases: `Published` is its own column here *and* would be a plausible
   * alias for `Status`, and the exact header must not be shadowed by whichever was registered
   * last. */
  HEADER_LOOKUP.set(normaliseHeader(col.header), col);
}
for (const col of CATALOG_CSV_COLUMNS) {
  for (const alias of col.aliases ?? []) {
    const key = normaliseHeader(alias);
    if (!HEADER_LOOKUP.has(key)) HEADER_LOOKUP.set(key, col);
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
    case 'number':
      return parseNumber(text);
    case 'grams':
      /* To pounds, the unit this platform stores. Rounded to four places because a 5 g accessory is
       * 0.011 lb and rounding to two would make it weightless. */
      return Math.round((parseNumber(text) / 453.59237) * 10000) / 10000;
    case 'integer':
      return Math.trunc(parseNumber(text));
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
      /* Undo the export's formula guard. `csvCell` prefixes an apostrophe to any value starting
       * `= + - @` so a spreadsheet does not evaluate it, and nothing here removed it — so a product
       * called "-40% Cable Bundle" came back from its own export as "'-40% Cable Bundle" and that
       * is what the storefront rendered. Names beginning with a hyphen are common ("-40% off",
       * "—Clearance"), and a round trip that is documented as lossless has to be lossless. */
      return text.startsWith("'") && /^'[=+\-@]/.test(text) ? text.slice(1) : text;
  }
}

/**
 * Read a number from a spreadsheet cell, refusing anything that is not one.
 *
 * The strip-then-`Number` idiom this replaces was silently catastrophic: stripping everything but
 * digits from "TBC" leaves the empty string, `Number('')` is `0`, and `0` is finite and
 * non-negative — so every guard passed and the product was saved at a price of zero, under a green
 * "1 updated" message. A merchant with "TBC", "N/A" or "ask Dave" anywhere in a price column gave
 * their catalogue away.
 *
 * Currency symbols, thousands separators and surrounding whitespace are still tolerated, because
 * they are what real exports contain. Parentheses are read as the accounting negative so that
 * "(5.00)" fails the non-negative check rather than being read as 5.
 *
 * @param text - The raw cell, already trimmed and known non-empty.
 * @returns The value.
 * @throws When the cell is not a number, or is negative.
 */
function parseNumber(text: string): number {
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text
    .replace(/^\(|\)$/g, '')
    .replace(/[$£€¥\s]/g, '')
    .replace(/,/g, '');

  /* An explicit shape, so nothing is inferred from a partial match: "12abc" is not 12. */
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) {
    throw new Error(`"${text}" is not a number`);
  }

  const value = Number(cleaned) * (negative ? -1 : 1);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`"${text}" is not a number of 0 or more`);
  }
  return value;
}

/**
 * The columns an exported file carries.
 *
 * Import-only headers are excluded: they exist so a file from another platform is understood, not
 * so our own export contains two columns meaning the same thing.
 */
export const EXPORT_CSV_COLUMNS: CsvColumn[] = CATALOG_CSV_COLUMNS.filter((c) => !c.importOnly);

/** One header from an uploaded file, resolved. */
export interface MappedColumn {
  index: number;
  column: CsvColumn;
}

/** What `mapColumns` made of a file's header row. */
export interface ColumnMapping {
  mapping: MappedColumn[];
  /** Headers this platform does not know. Reported so a merchant can see what was ignored. */
  unrecognised: string[];
  /** Headers dropped because an earlier column already writes the same field. */
  duplicates: string[];
}

/**
 * Resolve a file's header row, using each database column at most once.
 *
 * The "at most once" is the whole point. A real Shopify export carries `Published` (TRUE/FALSE) and
 * `Status` (active/draft) side by side, and both describe the same field here — so mapping both put
 * `status` into the generated `UPDATE` twice and Postgres rejected every row with
 * `column "status" specified more than once`. Because the import ran in a single transaction, the
 * first failure poisoned it and the entire file died at row one, on the exact migration path the
 * header of this module says is supported.
 *
 * Later duplicates are dropped rather than the file being refused: two columns agreeing about a
 * product's status is not an error a merchant can act on, and taking the first is the same rule a
 * spreadsheet applies.
 *
 * @param headers - The file's header row.
 * @returns The usable mapping, plus what was ignored and why.
 */
export function mapColumns(headers: string[]): ColumnMapping {
  const mapping: MappedColumn[] = [];
  const unrecognised: string[] = [];
  const duplicates: string[] = [];
  const claimed = new Set<string>();

  headers.forEach((header, index) => {
    const raw = String(header ?? '').trim();
    if (!raw) return;

    const column = columnForHeader(raw);
    if (!column) {
      unrecognised.push(raw);
      return;
    }
    if (column.readOnly || !column.column) {
      /* Computed columns are exported for reference. Silently ignored rather than reported as
       * unknown, because the merchant got them from us. */
      return;
    }
    if (claimed.has(column.column)) {
      duplicates.push(raw);
      return;
    }

    claimed.add(column.column);
    mapping.push({ index, column });
  });

  return { mapping, unrecognised, duplicates };
}

/**
 * Turn a Shopify-shaped price pair into this platform's `base_price` and `sale_price`.
 *
 * `Variant Price` is what the shopper pays; `Variant Compare At Price` is the higher price it is
 * being compared against. So a compare-at above the price means the product is on sale, and the two
 * map crosswise. A compare-at that is not above the price is not a sale — Shopify itself ignores
 * one — and is dropped rather than stored as a discount the constraint would reject.
 *
 * Blank cells keep meaning "leave this alone", which is why the return omits keys rather than
 * setting them to null.
 *
 * @param price - The parsed `Variant Price` cell, or undefined when blank or absent.
 * @param compareAt - The parsed `Variant Compare At Price` cell, or undefined.
 * @returns The columns to write.
 */
export function reconcilePrices(
  price: number | undefined,
  compareAt: number | undefined
): { base_price?: number; sale_price?: number | null } {
  if (price === undefined && compareAt === undefined) return {};

  /* Only a compare-at: it is the regular price, and whatever sale is on stays as it is. */
  if (price === undefined) return { base_price: compareAt };

  if (compareAt !== undefined && compareAt > price) {
    return { base_price: compareAt, sale_price: price };
  }

  /* No sale. Explicitly clearing `sale_price` rather than leaving it: a file that says this product
   * costs 19.99 and names no comparison price is saying it is not discounted, and leaving a stale
   * sale price behind would keep selling it at the old discount. */
  return { base_price: price, sale_price: null };
}

/**
 * The two price cells as Shopify writes them.
 *
 * @param basePrice - This product's regular price.
 * @param salePrice - This product's sale price, when it has one.
 * @returns `{ price, compareAt }` — what the shopper pays, and the comparison price if any.
 */
export function shopifyPricePair(
  basePrice: number | string | null,
  salePrice: number | string | null
): { price: number | string | null; compareAt: number | string | null } {
  const sale = salePrice === null || salePrice === undefined || salePrice === '' ? null : salePrice;
  return sale === null
    ? { price: basePrice, compareAt: null }
    : { price: sale, compareAt: basePrice };
}
