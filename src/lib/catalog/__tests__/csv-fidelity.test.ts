/**
 * What a CSV round trip must not change, and what a file from Shopify must mean.
 *
 * Every case here is a defect an adversarial review reproduced against the running import, and each
 * one had the same shape: the file was accepted, a green summary was returned, and the catalogue
 * was quietly wrong afterwards. That is the failure mode a merchant cannot detect, which is why
 * these are unit tests on the pure functions rather than assertions about an HTTP status.
 */

import {
  CATALOG_CSV_COLUMNS,
  EXPORT_CSV_COLUMNS,
  csvCell,
  mapColumns,
  parseCell,
  reconcilePrices,
  shopifyPricePair
} from '../csv';

describe('parseCell numbers', () => {
  it('refuses a word where a number belongs', () => {
    /*
     * The reason this test exists. The old implementation stripped everything but digits and fed
     * the remainder to `Number` — so "TBC" became "", `Number('')` is 0, and 0 passed both the
     * finite and non-negative guards. A merchant with "TBC" in a price column had those products
     * saved at zero, under "1 updated", and was giving them away.
     */
    for (const text of ['TBC', 'N/A', 'ask Dave', '--', 'twelve', '12abc', 'abc12']) {
      expect(() => parseCell(text, 'number')).toThrow();
    }
  });

  it('still accepts the shapes real exports contain', () => {
    expect(parseCell('1,299.00', 'number')).toBe(1299);
    expect(parseCell('$49.99', 'number')).toBe(49.99);
    expect(parseCell('  12  ', 'number')).toBe(12);
    expect(parseCell('.5', 'number')).toBe(0.5);
  });

  it('refuses a negative, including the accounting form', () => {
    expect(() => parseCell('-5', 'number')).toThrow();
    /* "(5.00)" is minus five in a spreadsheet, not five. Stripping the parentheses and reading it
     * as positive would silently invert the sign. */
    expect(() => parseCell('(5.00)', 'number')).toThrow();
  });

  it('converts grams to the pounds this platform stores', () => {
    /* Shopify's weight column is grams; a product here defaults to `weight_unit = 'lb'`. Importing
     * 250 as 250 lb drives shipping rates and the customs value on a commercial invoice. */
    expect(parseCell('250', 'grams')).toBeCloseTo(0.5512, 4);
    expect(parseCell('453.59237', 'grams')).toBeCloseTo(1, 4);
    /* Small enough that rounding to two places would make it weightless. */
    expect(parseCell('5', 'grams')).toBeGreaterThan(0);
  });

  it('leaves a blank cell alone rather than clearing the field', () => {
    expect(parseCell('', 'number')).toBeUndefined();
    expect(parseCell('   ', 'text')).toBeUndefined();
  });
});

describe('formula-guard round trip', () => {
  it('survives its own export', () => {
    /*
     * `csvCell` prefixes an apostrophe to anything starting `= + - @` so a spreadsheet does not
     * evaluate it. Nothing removed it on the way back in, so a product called "-40% Cable Bundle"
     * returned from its own export as "'-40% Cable Bundle" — and that is what the storefront
     * rendered. Names beginning with a hyphen are ordinary ("-40% off", "—Clearance").
     */
    for (const name of ['-40% Cable Bundle', '=1+1 Danger Widget', '+Extra', '@mention']) {
      const exported = csvCell(name);
      expect(exported).toContain("'");

      const unquoted = exported.startsWith('"')
        ? exported.slice(1, -1).replace(/""/g, '"')
        : exported;
      expect(parseCell(unquoted, 'text')).toBe(name);
    }
  });

  it('does not strip an apostrophe that is part of the name', () => {
    /* "O'Brien's Cider" must not become "Brien's Cider". Only an apostrophe directly guarding a
     * formula character is removed. */
    expect(parseCell("O'Brien's Cider", 'text')).toBe("O'Brien's Cider");
    expect(parseCell("'quoted'", 'text')).toBe("'quoted'");
  });
});

describe('mapColumns', () => {
  it('maps each field once, so a real Shopify export does not collide', () => {
    /*
     * A genuine Shopify export carries `Published` (TRUE/FALSE) *and* `Status` (active/draft), and
     * both describe the same field here. Mapping both put `status` in the generated UPDATE twice
     * and Postgres rejected every row with `column "status" specified more than once` — on the
     * exact migration path this module's header says is supported.
     */
    const { mapping, duplicates } = mapColumns([
      'Handle',
      'Title',
      'Variant SKU',
      'Published',
      'Status'
    ]);

    const columns = mapping.map((m) => m.column.column);
    expect(columns.filter((c) => c === 'status')).toHaveLength(1);
    expect(duplicates).toEqual(['Status']);
  });

  it('reports headers it does not know rather than ignoring them', () => {
    const { unrecognised } = mapColumns(['Variant SKU', 'Option1 Name', 'Option1 Value']);
    expect(unrecognised).toEqual(['Option1 Name', 'Option1 Value']);
  });

  it('silently skips computed columns, which came from our own export', () => {
    const { mapping, unrecognised } = mapColumns(['Variant SKU', 'Available', 'Days Of Cover']);
    expect(mapping).toHaveLength(1);
    expect(unrecognised).toEqual([]);
  });
});

describe('price semantics', () => {
  it("reads Shopify's pair crosswise", () => {
    /*
     * In a Shopify file `Variant Price` is what the shopper pays and `Compare At` is the
     * struck-through higher price. Mapping them one-for-one onto `base_price` and `sale_price`
     * inverted every discounted product, and in the import direction hit
     * `products_sale_price_not_above_base` and failed every row of a genuine export.
     */
    expect(reconcilePrices(19.99, 29.99)).toEqual({ base_price: 29.99, sale_price: 19.99 });
  });

  it('treats a compare-at that is not higher as no sale', () => {
    expect(reconcilePrices(19.99, 19.99)).toEqual({ base_price: 19.99, sale_price: null });
    expect(reconcilePrices(19.99, 9.99)).toEqual({ base_price: 19.99, sale_price: null });
  });

  it('clears a stale sale when the file names no comparison price', () => {
    /* A file saying "this costs 19.99" with no compare-at is saying it is not discounted. Leaving
     * an old sale price behind would keep selling it at the previous discount. */
    expect(reconcilePrices(19.99, undefined)).toEqual({ base_price: 19.99, sale_price: null });
  });

  it('leaves both alone when neither cell has a value', () => {
    expect(reconcilePrices(undefined, undefined)).toEqual({});
  });

  it("writes the pair back in Shopify's terms", () => {
    expect(shopifyPricePair(249, 199)).toEqual({ price: 199, compareAt: 249 });
    expect(shopifyPricePair(249, null)).toEqual({ price: 249, compareAt: null });
  });

  it('round-trips a discounted product without inverting it', () => {
    const { price, compareAt } = shopifyPricePair(249, 199);
    expect(reconcilePrices(Number(price), Number(compareAt))).toEqual({
      base_price: 249,
      sale_price: 199
    });
  });
});

describe('exported columns', () => {
  it('never writes two headers for one field', () => {
    /* Otherwise our own export cannot be re-imported without one of its columns being reported as
     * a dropped duplicate. */
    const written = EXPORT_CSV_COLUMNS.map((c) => c.column).filter(Boolean);
    expect(new Set(written).size).toBe(written.length);
  });

  it('keeps the import-only headers available on the way in', () => {
    const importOnly = CATALOG_CSV_COLUMNS.filter((c) => c.importOnly).map((c) => c.header);
    expect(importOnly.length).toBeGreaterThan(0);
    for (const header of importOnly) {
      expect(EXPORT_CSV_COLUMNS.some((c) => c.header === header)).toBe(false);
      expect(mapColumns([header]).mapping).toHaveLength(1);
    }
  });
});
