import {
  catalogueHref,
  formatDimensions,
  formatMoney,
  formatWeight,
  isPurchasable,
  productHref,
  resolveStoreHref,
  savingsPercent,
  stockLabel,
  stockState,
} from '../present';
import type { CatalogueQuery, ProductRecord } from '../types';

/**
 * Test fixtures for the storefront presentation helpers.
 * @param overrides - Fields to change for a given case
 * @returns A complete product record
 */
function makeProduct(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    storeId: '22222222-2222-4222-8222-222222222222',
    sku: 'SKU-1',
    vendor: null,
    barcode: null,
    name: 'Test Product',
    slug: 'test-product',
    shortDescription: null,
    longDescription: null,
    descriptionHtml: null,
    price: 100,
    compareAtPrice: null,
    trackInventory: true,
    stockQuantity: 25,
    lowStockThreshold: 5,
    allowBackorder: false,
    weight: null,
    weightUnit: 'lb',
    length: null,
    width: null,
    height: null,
    dimensionUnit: 'in',
    categoryId: null,
    categoryName: null,
    categorySlug: null,
    tags: [],
    featuredImageUrl: null,
    galleryImages: [],
    isFeatured: false,
    requiresShipping: true,
    metaTitle: null,
    metaDescription: null,
    ...overrides,
  };
}

const baseQuery: CatalogueQuery = {
  search: '',
  category: '',
  sort: 'featured',
  page: 1,
  pageSize: 12,
};

describe('stockState', () => {
  it('reports plenty of stock as in-stock', () => {
    expect(stockState(makeProduct({ stockQuantity: 25 }))).toBe('in-stock');
  });

  it('reports stock at or under the threshold as low', () => {
    expect(stockState(makeProduct({ stockQuantity: 5, lowStockThreshold: 5 }))).toBe('low-stock');
    expect(stockState(makeProduct({ stockQuantity: 1, lowStockThreshold: 5 }))).toBe('low-stock');
  });

  it('falls back to a sane threshold when the merchant set none', () => {
    expect(stockState(makeProduct({ stockQuantity: 3, lowStockThreshold: 0 }))).toBe('low-stock');
    expect(stockState(makeProduct({ stockQuantity: 40, lowStockThreshold: 0 }))).toBe('in-stock');
  });

  it('distinguishes backorder from out of stock at zero', () => {
    expect(stockState(makeProduct({ stockQuantity: 0 }))).toBe('out-of-stock');
    expect(stockState(makeProduct({ stockQuantity: 0, allowBackorder: true }))).toBe('backorder');
  });

  it('treats untracked inventory as available', () => {
    expect(stockState(makeProduct({ trackInventory: false, stockQuantity: 0 }))).toBe('untracked');
  });

  it('blocks purchase only when genuinely out of stock', () => {
    expect(isPurchasable(makeProduct({ stockQuantity: 0 }))).toBe(false);
    expect(isPurchasable(makeProduct({ stockQuantity: 0, allowBackorder: true }))).toBe(true);
    expect(isPurchasable(makeProduct({ trackInventory: false, stockQuantity: 0 }))).toBe(true);
  });
});

describe('stockLabel', () => {
  it('always returns a word, so colour is never the only cue', () => {
    expect(stockLabel('in-stock')).toBe('In stock');
    expect(stockLabel('out-of-stock')).toBe('Out of stock');
    expect(stockLabel('backorder')).toBe('On backorder');
    expect(stockLabel('untracked')).toBe('Available');
  });

  it('makes low stock concrete, and handles the singular', () => {
    expect(stockLabel('low-stock', 3)).toBe('Only 3 left');
    expect(stockLabel('low-stock', 1)).toBe('Only 1 left');
  });
});

describe('formatMoney', () => {
  it('formats in the store currency', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
  });

  it('survives a bad currency code rather than throwing mid-render', () => {
    expect(formatMoney(10, 'NOT-A-CURRENCY')).toBe('$10.00');
  });

  it('treats a non-finite amount as zero', () => {
    expect(formatMoney(Number.NaN, 'USD')).toBe('$0.00');
  });
});

describe('savingsPercent', () => {
  it('computes a real saving', () => {
    expect(savingsPercent(80, 100)).toBe(20);
  });

  it('refuses to invent a saving when the compare-at is not higher', () => {
    expect(savingsPercent(100, 100)).toBeNull();
    expect(savingsPercent(100, 80)).toBeNull();
    expect(savingsPercent(100, null)).toBeNull();
  });
});

describe('shipping facts', () => {
  it('formats a recorded weight and trims trailing zeros', () => {
    expect(formatWeight({ weight: 2.5, weightUnit: 'lb' })).toBe('2.5 lb');
    expect(formatWeight({ weight: 2.0, weightUnit: 'kg' })).toBe('2 kg');
  });

  it('reports nothing when the merchant has not recorded a measurement', () => {
    expect(formatWeight({ weight: null, weightUnit: 'lb' })).toBeNull();
    expect(formatWeight({ weight: 0, weightUnit: 'lb' })).toBeNull();
    expect(
      formatDimensions({ length: 4, width: null, height: 2, dimensionUnit: 'in' }),
    ).toBeNull();
  });

  it('formats complete dimensions', () => {
    expect(
      formatDimensions({ length: 8, width: 7, height: 3.5, dimensionUnit: 'in' }),
    ).toBe('8 × 7 × 3.5 in');
  });
});

describe('catalogueHref', () => {
  const base = '/store/acme/products';

  it('omits defaults so one state has exactly one URL', () => {
    expect(catalogueHref(base, baseQuery)).toBe(base);
  });

  it('encodes the filters that are set', () => {
    expect(catalogueHref(base, baseQuery, { category: 'audio', sort: 'price-asc' })).toBe(
      `${base}?category=audio&sort=price-asc`,
    );
  });

  it('returns to page one when a filter changes', () => {
    const onPageFive = { ...baseQuery, page: 5 };
    expect(catalogueHref(base, onPageFive, { category: 'audio' })).toBe(`${base}?category=audio`);
  });

  it('keeps the page when only paging', () => {
    expect(catalogueHref(base, { ...baseQuery, category: 'audio' }, { page: 3 })).toBe(
      `${base}?category=audio&page=3`,
    );
  });
});

describe('productHref', () => {
  it('prefers the slug and falls back to the id', () => {
    expect(productHref('acme', { id: 'abc', slug: 'nice-thing' })).toBe(
      '/store/acme/product/nice-thing',
    );
    expect(productHref('acme', { id: 'abc', slug: '' })).toBe('/store/acme/product/abc');
  });
});

describe('resolveStoreHref', () => {
  const slug = 'acme';

  it('keeps in-store paths', () => {
    expect(resolveStoreHref(slug, '/store/acme/products')).toBe('/store/acme/products');
  });

  it('rebases a bare path onto the store', () => {
    expect(resolveStoreHref(slug, '/products')).toBe('/store/acme/products');
    expect(resolveStoreHref(slug, 'collections/new')).toBe('/store/acme/collections/new');
  });

  it('refuses to let merchant copy redirect off-site', () => {
    // A hero button is merchant input; an absolute URL here would turn the
    // storefront into an open redirector.
    expect(resolveStoreHref(slug, 'https://evil.example')).toBe('/store/acme/products');
    expect(resolveStoreHref(slug, '//evil.example')).toBe('/store/acme/products');
    expect(resolveStoreHref(slug, 'javascript:alert(1)')).toBe('/store/acme/products');
    expect(resolveStoreHref(slug, 'data:text/html,<script>')).toBe('/store/acme/products');
    expect(resolveStoreHref(slug, '\\\\evil.example')).toBe('/store/acme/products');
  });

  it('allows in-page anchors', () => {
    expect(resolveStoreHref(slug, '#faq')).toBe('#faq');
  });

  it('falls back for empty or non-string input', () => {
    expect(resolveStoreHref(slug, '')).toBe('/store/acme/products');
    expect(resolveStoreHref(slug, undefined)).toBe('/store/acme/products');
    expect(resolveStoreHref(slug, 42)).toBe('/store/acme/products');
  });
});
