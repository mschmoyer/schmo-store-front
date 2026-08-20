/**
 * Variant domain tests.
 *
 * Two things here earn their keep: the inheritance rules (a nullable price
 * meaning "inherit" is easy to get subtly wrong, and wrong here means charging
 * the wrong amount) and `availableValues` (the greying logic that decides
 * whether a selector feels working or broken).
 */

import {
  availableValues,
  defaultVariant,
  findVariant,
  priceRange,
  resolveVariant,
  variantTitle,
  type ProductVariant,
  type ResolvedVariant,
  type VariantInheritanceContext,
} from '../variants';

const product: VariantInheritanceContext = {
  basePriceCents: 4800,
  salePriceCents: null,
  trackInventory: true,
  allowBackorder: false,
};

/**
 * Build a variant with sensible defaults.
 * @param overrides - Fields to change
 * @returns A variant
 */
function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 'v1',
    sku: 'SKU-1',
    options: ['Medium', null, null],
    priceCents: null,
    salePriceCents: null,
    stockQuantity: 5,
    trackInventory: null,
    allowBackorder: null,
    imageUrl: null,
    position: 1,
    isActive: true,
    ...overrides,
  };
}

describe('variantTitle', () => {
  it('joins the axes a shopper actually chose', () => {
    expect(variantTitle(['Alpine Green', 'Medium', null])).toBe('Alpine Green / Medium');
    expect(variantTitle(['Medium', null, null])).toBe('Medium');
  });

  it('is empty for a product with no options', () => {
    expect(variantTitle([null, null, null])).toBe('');
    expect(variantTitle([])).toBe('');
  });

  it('drops blank values rather than rendering empty segments', () => {
    expect(variantTitle(['Green', '  ', 'Large'])).toBe('Green / Large');
  });
});

describe('price inheritance', () => {
  it('inherits the product price when the variant sets none', () => {
    expect(resolveVariant(variant(), product).priceCents).toBe(4800);
  });

  it('overrides the product price when the variant sets one', () => {
    expect(resolveVariant(variant({ priceCents: 5400 }), product).priceCents).toBe(5400);
  });

  it('treats a variant sale price as an offer against its own regular price', () => {
    const resolved = resolveVariant(variant({ priceCents: 5400, salePriceCents: 4200 }), product);
    expect(resolved.priceCents).toBe(4200);
    expect(resolved.compareAtCents).toBe(5400);
  });

  it('inherits a product sale price only when the variant has not repriced', () => {
    const onSale = { ...product, salePriceCents: 3600 };

    // Inheriting everything: the product's sale applies.
    const inheriting = resolveVariant(variant(), onSale);
    expect(inheriting.priceCents).toBe(3600);
    expect(inheriting.compareAtCents).toBe(4800);

    // The XXL costs more. Inheriting the $36 sale onto it would invent a
    // discount nobody set, so it does not.
    const repriced = resolveVariant(variant({ priceCents: 6000 }), onSale);
    expect(repriced.priceCents).toBe(6000);
    expect(repriced.compareAtCents).toBeNull();
  });

  it('ignores a sale price above the regular price rather than showing a fake discount', () => {
    // A "discount" that raises the price is a data error, and rendering it
    // would be a lie told in the merchant's name.
    const resolved = resolveVariant(variant({ priceCents: 4000, salePriceCents: 5000 }), product);
    expect(resolved.priceCents).toBe(4000);
    expect(resolved.compareAtCents).toBeNull();
  });

  it('does not treat an equal sale price as an offer', () => {
    const resolved = resolveVariant(variant({ priceCents: 4800, salePriceCents: 4800 }), product);
    expect(resolved.priceCents).toBe(4800);
    expect(resolved.compareAtCents).toBeNull();
  });

  it('handles a free variant without inheriting the product price', () => {
    // 0 is a real price and must not be swallowed by `??` or a falsy check.
    expect(resolveVariant(variant({ priceCents: 0 }), product).priceCents).toBe(0);
  });
});

describe('stock inheritance', () => {
  it('is out of stock at zero when the product tracks inventory', () => {
    expect(resolveVariant(variant({ stockQuantity: 0 }), product).inStock).toBe(false);
  });

  it('is always in stock when inventory is not tracked, and reports no count', () => {
    const resolved = resolveVariant(
      variant({ stockQuantity: 0, trackInventory: false }),
      product,
    );
    expect(resolved.inStock).toBe(true);
    expect(resolved.stockQuantity).toBeNull();
  });

  it('lets a variant opt into backorder against a product that does not', () => {
    const resolved = resolveVariant(
      variant({ stockQuantity: 0, allowBackorder: true }),
      product,
    );
    expect(resolved.inStock).toBe(true);
  });

  it('lets a variant opt out of a product-wide backorder', () => {
    const backordering = { ...product, allowBackorder: true };
    expect(
      resolveVariant(variant({ stockQuantity: 0, allowBackorder: false }), backordering).inStock,
    ).toBe(false);
  });
});

describe('findVariant', () => {
  const variants = [
    { id: 'a', options: ['Green', 'S', null] },
    { id: 'b', options: ['Green', 'M', null] },
    { id: 'c', options: ['Navy', 'S', null] },
  ];

  it('matches on the axes the product declares', () => {
    expect(findVariant(variants, ['Green', 'M', null], 2)?.id).toBe('b');
    expect(findVariant(variants, ['Navy', 'S'], 2)?.id).toBe('c');
  });

  it('returns null for a combination the merchant does not stock', () => {
    expect(findVariant(variants, ['Navy', 'M', null], 2)).toBeNull();
  });

  it('ignores axes beyond the declared count', () => {
    // A one-axis product should match on colour alone, even though the stored
    // rows carry a size in option2.
    expect(findVariant(variants, ['Green', null, null], 1)?.id).toBe('a');
  });

  it('returns null when the product declares no axes', () => {
    expect(findVariant(variants, ['Green'], 0)).toBeNull();
  });
});

/**
 * Resolve a set of variants for the selector tests.
 * @param rows - Partial variants
 * @returns Resolved variants
 */
function resolveAll(rows: Partial<ProductVariant>[]): ResolvedVariant[] {
  return rows.map((row, index) =>
    resolveVariant(variant({ id: `v${index}`, sku: `SKU-${index}`, ...row }), product),
  );
}

describe('availableValues', () => {
  const variants = resolveAll([
    { options: ['Green', 'S', null], stockQuantity: 3 },
    { options: ['Green', 'M', null], stockQuantity: 0 },
    { options: ['Navy', 'S', null], stockQuantity: 7 },
  ]);

  it('marks a combination the merchant does not stock as non-existent', () => {
    // Navy/M was never made.
    const sizes = availableValues(variants, 1, ['Navy', null, null], ['S', 'M']);
    expect(sizes).toEqual([
      { value: 'S', exists: true, inStock: true },
      { value: 'M', exists: false, inStock: false },
    ]);
  });

  it('keeps a sold-out combination reachable and flags it', () => {
    // Green/M exists and is gone. A shopper is entitled to see that rather
    // than watch their size vanish from the page.
    const sizes = availableValues(variants, 1, ['Green', null, null], ['S', 'M']);
    expect(sizes).toEqual([
      { value: 'S', exists: true, inStock: true },
      { value: 'M', exists: true, inStock: false },
    ]);
  });

  it('never greys out the axis being chosen on', () => {
    // This is the bug that makes a selector feel broken: with Green selected,
    // Navy must still be offered, or the shopper cannot change their mind.
    const colours = availableValues(variants, 0, ['Green', null, null], ['Green', 'Navy']);
    expect(colours.every((entry) => entry.exists)).toBe(true);
  });

  it('offers everything that exists when nothing is selected yet', () => {
    const colours = availableValues(variants, 0, [null, null, null], ['Green', 'Navy']);
    expect(colours).toEqual([
      { value: 'Green', exists: true, inStock: true },
      { value: 'Navy', exists: true, inStock: true },
    ]);
  });

  it('ignores inactive variants', () => {
    const withHidden = resolveAll([
      { options: ['Green', 'S', null] },
      { options: ['Navy', 'S', null], isActive: false },
    ]);
    const colours = availableValues(withHidden, 0, [null, null, null], ['Green', 'Navy']);
    expect(colours[1]).toEqual({ value: 'Navy', exists: false, inStock: false });
  });
});

describe('defaultVariant', () => {
  it('opens on the first in-stock variant, not the first variant', () => {
    // Opening on a sold-out size shows a disabled buy button to a shopper who
    // has chosen nothing, which reads as "this shop has nothing".
    const variants = resolveAll([
      { options: ['S', null, null], stockQuantity: 0 },
      { options: ['M', null, null], stockQuantity: 4 },
    ]);
    expect(defaultVariant(variants)?.options[0]).toBe('M');
  });

  it('falls back to the first variant when everything is sold out, so a price still renders', () => {
    const variants = resolveAll([
      { options: ['S', null, null], stockQuantity: 0 },
      { options: ['M', null, null], stockQuantity: 0 },
    ]);
    expect(defaultVariant(variants)?.options[0]).toBe('S');
  });

  it('skips inactive variants entirely', () => {
    const variants = resolveAll([
      { options: ['S', null, null], isActive: false },
      { options: ['M', null, null], stockQuantity: 0 },
    ]);
    expect(defaultVariant(variants)?.options[0]).toBe('M');
  });

  it('returns null when there is nothing sellable', () => {
    expect(defaultVariant([])).toBeNull();
    expect(defaultVariant(resolveAll([{ isActive: false }]))).toBeNull();
  });
});

describe('priceRange', () => {
  it('reports both ends so a card does not imply one price', () => {
    const variants = resolveAll([
      { options: ['S', null, null], priceCents: 1800 },
      { options: ['M', null, null], priceCents: 4400 },
    ]);
    expect(priceRange(variants)).toEqual({ fromCents: 1800, toCents: 4400 });
  });

  it('collapses to a single figure when every variant costs the same', () => {
    const range = priceRange(resolveAll([{ options: ['S', null, null] }, { options: ['M', null, null] }]));
    expect(range).toEqual({ fromCents: 4800, toCents: 4800 });
  });

  it('ignores inactive variants and returns null when nothing is sellable', () => {
    expect(priceRange(resolveAll([{ isActive: false, priceCents: 100 }]))).toBeNull();
    expect(priceRange([])).toBeNull();
  });
});
