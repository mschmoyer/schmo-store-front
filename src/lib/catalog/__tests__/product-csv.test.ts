/**
 * CSV import/export tests.
 *
 * The parser is hand-rolled, so the cases that matter are the ones a real
 * spreadsheet produces and a naive `split(',')` gets wrong: quoted fields
 * containing commas, embedded newlines, doubled quotes, a UTF-8 BOM, and CRLF
 * line endings. Getting any of those wrong shifts every column right of the
 * offending cell, which corrupts a merchant's catalogue quietly rather than
 * loudly.
 *
 * The other half is the round trip. An export a merchant edits and re-imports
 * has to describe the same catalogue, or the feature is a trap.
 */

import {
  CSV_COLUMNS,
  csvField,
  parseCsv,
  toCsv,
  validateImport,
} from '../product-csv';

describe('csvField', () => {
  it('leaves ordinary values alone', () => {
    expect(csvField('Blue Mug')).toBe('Blue Mug');
    expect(csvField(12.5)).toBe('12.5');
  });

  it('renders null and undefined as empty', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('quotes fields containing a comma, a quote or a newline', () => {
    expect(csvField('Notebook, A5')).toBe('"Notebook, A5"');
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
  });

  it('defuses spreadsheet formula injection', () => {
    // Excel and Sheets execute a cell beginning =, +, - or @. A merchant
    // opening their *own* export should not run a formula somebody put in a
    // product name.
    expect(csvField('=cmd|calc')).toBe("'=cmd|calc");
    expect(csvField('+1234')).toBe("'+1234");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvField('-5')).toBe("'-5");
  });
});

describe('parseCsv', () => {
  it('reads a plain file', () => {
    const rows = parseCsv('sku,name\nA-1,Mug\nA-2,Bowl');
    expect(rows).toEqual([
      { sku: 'A-1', name: 'Mug' },
      { sku: 'A-2', name: 'Bowl' },
    ]);
  });

  it('keeps a comma inside a quoted field', () => {
    // The case a split(',') implementation shifts every later column on.
    const rows = parseCsv('sku,name,price\nA-1,"Notebook, A5",12.50');
    expect(rows[0]).toEqual({ sku: 'A-1', name: 'Notebook, A5', price: '12.50' });
  });

  it('reads a doubled quote as one literal quote', () => {
    const rows = parseCsv('sku,name\nA-1,"He said ""hi"""');
    expect(rows[0].name).toBe('He said "hi"');
  });

  it('keeps a newline inside a quoted field', () => {
    const rows = parseCsv('sku,description\nA-1,"line one\nline two"\nA-2,short');
    expect(rows).toHaveLength(2);
    expect(rows[0].description).toBe('line one\nline two');
    expect(rows[1].sku).toBe('A-2');
  });

  it('handles CRLF endings', () => {
    const rows = parseCsv('sku,name\r\nA-1,Mug\r\nA-2,Bowl\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[1].name).toBe('Bowl');
  });

  it('strips a UTF-8 BOM so the first header is not "\\ufeffsku"', () => {
    // Excel writes one, and without this every row would be missing its SKU.
    const rows = parseCsv('﻿sku,name\nA-1,Mug');
    expect(rows[0].sku).toBe('A-1');
  });

  it('lowercases and trims headers', () => {
    const rows = parseCsv(' SKU , Base_Price \nA-1,10');
    expect(rows[0]).toEqual({ sku: 'A-1', base_price: '10' });
  });

  it('skips blank lines, including a trailing newline', () => {
    expect(parseCsv('sku,name\nA-1,Mug\n\n')).toHaveLength(1);
    expect(parseCsv('sku,name\nA-1,Mug\n,\nA-2,Bowl')).toHaveLength(2);
  });

  it('returns nothing for an empty document', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('sku,name')).toEqual([]);
  });

  it('tolerates a row with fewer cells than the header', () => {
    const rows = parseCsv('sku,name,price\nA-1,Mug');
    expect(rows[0]).toEqual({ sku: 'A-1', name: 'Mug', price: '' });
  });
});

describe('validateImport', () => {
  /**
   * Build one valid record.
   * @param overrides - Cells to change
   * @returns A CSV record
   */
  function record(overrides: Record<string, string> = {}): Record<string, string> {
    return { sku: 'A-1', name: 'Blue Mug', base_price: '12.50', ...overrides };
  }

  it('accepts a minimal row and derives its slug', () => {
    const { rows, problems } = validateImport([record()]);
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({ sku: 'A-1', name: 'Blue Mug', slug: 'blue-mug', basePrice: 12.5 });
  });

  it('reports the spreadsheet row number, counting the header', () => {
    // A merchant fixing row 3 must be able to find row 3 in their file.
    const { problems } = validateImport([record(), record({ sku: '' }), record({ sku: 'A-3' })]);
    expect(problems).toEqual([{ line: 3, sku: '', message: 'Missing SKU' }]);
  });

  it('collects problems instead of stopping at the first', () => {
    const { rows, problems } = validateImport([
      record({ sku: '' }),
      record({ sku: 'A-2', name: '' }),
      record({ sku: 'A-3', base_price: 'free' }),
      record({ sku: 'A-4' }),
    ]);
    expect(problems).toHaveLength(3);
    // The good row still imports; 4,000 rows must not fail because of three.
    expect(rows.map((row) => row.sku)).toEqual(['A-4']);
  });

  it('rejects a SKU used twice in one file', () => {
    const { problems } = validateImport([record(), record({ name: 'Other' })]);
    expect(problems[0].message).toMatch(/appears more than once/);
  });

  it('makes a colliding slug unique rather than rejecting the row', () => {
    // Two products genuinely called "Blue Mug" is ordinary. Failing the second
    // on a constraint the merchant cannot see is not.
    const { rows, problems } = validateImport([record(), record({ sku: 'A-2' })]);
    expect(problems).toEqual([]);
    expect(rows[0].slug).toBe('blue-mug');
    expect(rows[1].slug).not.toBe('blue-mug');
  });

  it('accepts a price of zero but not a negative one', () => {
    expect(validateImport([record({ base_price: '0' })]).rows[0].basePrice).toBe(0);
    expect(validateImport([record({ base_price: '-1' })]).problems).toHaveLength(1);
  });

  it('strips currency symbols and thousands separators', () => {
    expect(validateImport([record({ base_price: '$1299.00' })]).rows[0].basePrice).toBe(1299);
  });

  it('splits tags on semicolons, not commas', () => {
    // Commas are the field separator; a tags cell using them would have been
    // split into columns long before it reached here.
    const { rows } = validateImport([record({ tags: 'ceramic; handmade ; kitchen' })]);
    expect(rows[0].tags).toEqual(['ceramic', 'handmade', 'kitchen']);
  });

  it('reads the many things a spreadsheet calls true', () => {
    for (const value of ['true', 'TRUE', 'yes', 'y', '1', 'Active']) {
      expect(validateImport([record({ is_active: value })]).rows[0].isActive).toBe(true);
    }
    for (const value of ['false', 'no', '0']) {
      expect(validateImport([record({ is_active: value })]).rows[0].isActive).toBe(false);
    }
    // An empty cell means "list it", which is what a merchant adding products
    // is trying to do.
    expect(validateImport([record({ is_active: '' })]).rows[0].isActive).toBe(true);
  });

  it('treats an empty sale price as no sale price, not as zero', () => {
    // Zero would put every imported product on a 100% discount.
    expect(validateImport([record({ sale_price: '' })]).rows[0].salePrice).toBeNull();
    expect(validateImport([record({ sale_price: '9.99' })]).rows[0].salePrice).toBe(9.99);
  });

  it('rejects a name that cannot produce a slug', () => {
    const { problems } = validateImport([record({ name: '!!!' })]);
    expect(problems[0].message).toMatch(/URL slug/);
  });
});

describe('the export/import round trip', () => {
  it('survives commas, quotes and newlines intact', () => {
    const original = [
      {
        sku: 'A-1',
        name: 'Notebook, A5',
        slug: 'notebook-a5',
        short_description: 'He said "buy it"\nand they did',
        base_price: '12.50',
        sale_price: '',
        stock_quantity: '25',
        category: 'Stationery',
        tags: 'paper; desk',
        featured_image_url: '',
        weight: '0.2',
        is_active: 'true',
      },
    ];

    const parsed = parseCsv(toCsv(original, CSV_COLUMNS));
    expect(parsed[0].name).toBe('Notebook, A5');
    expect(parsed[0].short_description).toBe('He said "buy it"\nand they did');

    const { rows, problems } = validateImport(parsed);
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({
      sku: 'A-1',
      name: 'Notebook, A5',
      slug: 'notebook-a5',
      basePrice: 12.5,
      salePrice: null,
      stockQuantity: 25,
      tags: ['paper', 'desk'],
      isActive: true,
    });
  });

  it('exports every column the importer reads', () => {
    const csv = toCsv([], CSV_COLUMNS);
    expect(csv.split('\r\n')[0].split(',')).toEqual([...CSV_COLUMNS]);
  });
});
