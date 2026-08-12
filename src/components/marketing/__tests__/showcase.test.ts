import { interleaveProducts, pickHeroProduct } from '../data/showcase';
import type { ShowcaseProduct, ShowcaseStore } from '../data/showcase';

/**
 * Builds a stub product.
 *
 * @param sku - The product SKU, also used to seed the name.
 * @param overrides - Fields to override.
 * @returns A showcase product.
 */
function product(sku: string, overrides: Partial<ShowcaseProduct> = {}): ShowcaseProduct {
  return {
    sku,
    name: `Product ${sku}`,
    slug: sku.toLowerCase(),
    price: 10,
    compareAt: null,
    stock: 5,
    image: `/demo/products/${sku.toLowerCase()}.svg`,
    blurb: null,
    featured: false,
    ...overrides,
  };
}

/**
 * Builds a stub store.
 *
 * @param slug - The store slug.
 * @param products - The store's catalog.
 * @returns A showcase store.
 */
function store(slug: string, products: ShowcaseProduct[]): ShowcaseStore {
  return {
    slug,
    name: slug,
    description: '',
    heroTitle: '',
    heroDescription: '',
    theme: 'default',
    logo: null,
    hero: `/demo/hero/${slug}.svg`,
    products,
    productCount: products.length,
    outOfStockCount: products.filter((p) => p.stock === 0).length,
  };
}

describe('interleaveProducts', () => {
  const stores = [
    store('a', [product('A1'), product('A2'), product('A3')]),
    store('b', [product('B1'), product('B2')]),
    store('c', [product('C1'), product('C2'), product('C3')]),
  ];

  it('rotates between stores so the grid does not read as one vertical', () => {
    const out = interleaveProducts(stores, 6).map((i) => i.product.sku);
    expect(out).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
  });

  it('keeps going once a shorter store runs out', () => {
    const out = interleaveProducts(stores, 8).map((i) => i.product.sku);
    expect(out).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'C3']);
  });

  it('respects the limit and survives an empty catalog', () => {
    expect(interleaveProducts(stores, 2)).toHaveLength(2);
    expect(interleaveProducts([], 10)).toHaveLength(0);
  });
});

describe('pickHeroProduct', () => {
  it('prefers an illustrated, in-stock, on-sale product', () => {
    const stores = [
      store('a', [
        product('A1', { stock: 0, compareAt: 20 }),
        product('A2', { stock: 4, compareAt: 20 }),
      ]),
    ];
    expect(pickHeroProduct(stores)?.product.sku).toBe('A2');
  });

  it('falls back to any illustrated product', () => {
    const stores = [store('a', [product('A1', { stock: 0, compareAt: null })])];
    expect(pickHeroProduct(stores)?.product.sku).toBe('A1');
  });

  it('returns null when nothing loaded', () => {
    expect(pickHeroProduct([])).toBeNull();
    expect(pickHeroProduct([store('a', [])])).toBeNull();
  });
});
