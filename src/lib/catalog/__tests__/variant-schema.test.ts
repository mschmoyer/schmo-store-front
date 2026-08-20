/**
 * Variant payload validation tests.
 *
 * The single-field rules mostly test zod. The cross-field rules are the ones
 * worth writing down: a payload can be perfectly well-typed and still describe
 * an impossible product, and each of those cases would otherwise reach the
 * database and come back as a constraint error with no field attached to it.
 */

import { saveVariantsBodySchema, MAX_VARIANTS_PER_PRODUCT } from '../variant-schema';

/**
 * Build a valid variant.
 * @param overrides - Fields to change
 * @returns A variant payload entry
 */
function variant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sku: 'SKU-1',
    options: ['S'],
    priceCents: null,
    salePriceCents: null,
    stockQuantity: 4,
    trackInventory: null,
    allowBackorder: null,
    imageUrl: null,
    position: 1,
    isActive: true,
    ...overrides,
  };
}

/**
 * Build a valid body.
 * @param overrides - Fields to change
 * @returns A save payload
 */
function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    options: [{ name: 'Size', position: 1, values: ['S', 'M'] }],
    variants: [variant()],
    ...overrides,
  };
}

/**
 * Collect the messages a payload produces.
 * @param payload - Candidate body
 * @returns Issue messages, empty when valid
 */
function errors(payload: unknown): string[] {
  const result = saveVariantsBodySchema.safeParse(payload);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('a valid payload', () => {
  it('accepts one axis and one variant', () => {
    expect(errors(body())).toEqual([]);
  });

  it('accepts a product with neither options nor variants', () => {
    // How a merchant turns variants off again.
    expect(errors({ options: [], variants: [] })).toEqual([]);
  });

  it('accepts three axes', () => {
    expect(
      errors({
        options: [
          { name: 'Colour', position: 1, values: ['Green'] },
          { name: 'Size', position: 2, values: ['M'] },
          { name: 'Fit', position: 3, values: ['Slim'] },
        ],
        variants: [variant({ options: ['Green', 'M', 'Slim'] })],
      }),
    ).toEqual([]);
  });

  it('accepts a zero price, which is a real price', () => {
    expect(errors(body({ variants: [variant({ priceCents: 0 })] }))).toEqual([]);
  });
});

describe('option axes', () => {
  it('rejects a fourth axis', () => {
    expect(
      errors({
        options: [1, 2, 3, 4].map((position) => ({
          name: `Axis ${position}`,
          position,
          values: ['x'],
        })),
        variants: [variant({ options: ['x', 'x', 'x'] })],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('rejects gaps and repeats in positions', () => {
    // Positions map onto option1..3; a gap leaves a variant column no axis
    // explains.
    expect(
      errors({
        options: [
          { name: 'Colour', position: 1, values: ['Green'] },
          { name: 'Size', position: 3, values: ['M'] },
        ],
        variants: [variant({ options: ['Green', 'M'] })],
      }),
    ).toContain('Option positions must run 1, 2, 3 with no gaps or repeats');
  });

  it('rejects two axes with the same name', () => {
    expect(
      errors({
        options: [
          { name: 'Size', position: 1, values: ['S'] },
          { name: 'size', position: 2, values: ['M'] },
        ],
        variants: [variant({ options: ['S', 'M'] })],
      }).join(' '),
    ).toMatch(/is used by another option/);
  });

  it('rejects a value listed twice, case-insensitively', () => {
    // "Green" and "green" are one colour to a shopper and two rows to Postgres.
    expect(
      errors(body({ options: [{ name: 'Colour', position: 1, values: ['Green', 'green'] }] })).join(
        ' ',
      ),
    ).toMatch(/is listed twice/);
  });

  it('rejects an axis with no values', () => {
    expect(
      errors(body({ options: [{ name: 'Size', position: 1, values: [] }] })),
    ).toContain('An option needs at least one value');
  });

  it('rejects a swatch that is not a hex colour', () => {
    expect(
      errors(
        body({
          options: [
            {
              name: 'Colour',
              position: 1,
              values: ['Green'],
              valueMeta: { Green: { swatch: 'forestgreen' } },
            },
          ],
          variants: [variant({ options: ['Green'] })],
        }),
      ).join(' '),
    ).toMatch(/hex colour/);
  });
});

describe('options and variants must agree', () => {
  it('rejects variants with no axes', () => {
    expect(errors({ options: [], variants: [variant()] })).toContain(
      'Add at least one option, or remove the variants',
    );
  });

  it('rejects axes with no variants', () => {
    // An axis with nothing to buy is a silent dead end on the storefront.
    expect(errors(body({ variants: [] }))).toContain(
      'Add at least one variant, or remove the options',
    );
  });

  it('rejects a variant naming a value the axis does not offer', () => {
    expect(errors(body({ variants: [variant({ options: ['XL'] })] })).join(' ')).toMatch(
      /"XL" is not one of the values for "Size"/,
    );
  });

  it('rejects a variant leaving an axis unchosen', () => {
    expect(
      errors(
        body({
          options: [
            { name: 'Colour', position: 1, values: ['Green'] },
            { name: 'Size', position: 2, values: ['M'] },
          ],
          variants: [variant({ options: ['Green', null] })],
        }),
      ).join(' '),
    ).toMatch(/Choose a value for "Size"/);
  });

  it('rejects two variants covering the same combination', () => {
    expect(
      errors(
        body({
          variants: [variant({ sku: 'A' }), variant({ sku: 'B', position: 2 })],
        }),
      ),
    ).toContain('Another variant already covers this combination');
  });

  it('does not confuse a slash-bearing value with two values', () => {
    // The combination key is JSON, not a joined string, so "Red/Blue" on one
    // axis cannot collide with ["Red", "Blue"] across two.
    expect(
      errors({
        options: [
          { name: 'Colour', position: 1, values: ['Red/Blue', 'Red'] },
          { name: 'Size', position: 2, values: ['Blue', 'M'] },
        ],
        variants: [
          variant({ sku: 'A', options: ['Red/Blue', 'M'] }),
          variant({ sku: 'B', options: ['Red', 'Blue'], position: 2 }),
        ],
      }),
    ).toEqual([]);
  });

  it('rejects a SKU used twice', () => {
    expect(
      errors(
        body({
          options: [{ name: 'Size', position: 1, values: ['S', 'M'] }],
          variants: [variant({ sku: 'DUP' }), variant({ sku: 'dup', options: ['M'], position: 2 })],
        }),
      ).join(' '),
    ).toMatch(/is used by another variant/);
  });
});

describe('variant fields', () => {
  it('rejects a sale price at or above the variant price', () => {
    // The renderer ignores such a value rather than showing a fake discount,
    // so storing it would be storing something that silently does nothing.
    for (const sale of [5000, 6000]) {
      expect(
        errors(body({ variants: [variant({ priceCents: 5000, salePriceCents: sale })] })),
      ).toContain('A sale price must be below the variant price');
    }
  });

  it('accepts a sale price below the variant price', () => {
    expect(
      errors(body({ variants: [variant({ priceCents: 5000, salePriceCents: 4000 })] })),
    ).toEqual([]);
  });

  it('keeps null distinct from zero for price', () => {
    // null means "inherit the product"; 0 means free. Both must survive.
    const parsed = saveVariantsBodySchema.parse(body({ variants: [variant({ priceCents: null })] }));
    expect(parsed.variants[0].priceCents).toBeNull();
    const zero = saveVariantsBodySchema.parse(body({ variants: [variant({ priceCents: 0 })] }));
    expect(zero.variants[0].priceCents).toBe(0);
  });

  it('rejects a negative price or stock', () => {
    expect(errors(body({ variants: [variant({ priceCents: -1 })] })).length).toBeGreaterThan(0);
    expect(errors(body({ variants: [variant({ stockQuantity: -1 })] })).length).toBeGreaterThan(0);
  });

  it('rejects a fractional price, since money is integer cents', () => {
    expect(errors(body({ variants: [variant({ priceCents: 19.99 })] })).length).toBeGreaterThan(0);
  });

  it('requires a SKU', () => {
    expect(errors(body({ variants: [variant({ sku: '   ' })] }))).toContain(
      'Every variant needs a SKU',
    );
  });

  it('rejects unknown keys rather than silently dropping them', () => {
    expect(errors(body({ variants: [variant({ costCents: 100 })] })).length).toBeGreaterThan(0);
    expect(errors({ ...body(), extra: true }).length).toBeGreaterThan(0);
  });

  it('caps the number of variants', () => {
    const many = Array.from({ length: MAX_VARIANTS_PER_PRODUCT + 1 }, (_, index) =>
      variant({ sku: `SKU-${index}`, position: index + 1 }),
    );
    expect(errors(body({ variants: many })).length).toBeGreaterThan(0);
  });
});
