/**
 * Navigation tests.
 *
 * The load-bearing part here is `isSafeNavHref`. A menu item's `href` is
 * merchant-authored text that goes straight into an anchor, so it is the one
 * field in the navigation model that can carry an attack. The rest of the file
 * covers the `undefined` vs `[]` distinction, which is easy to collapse by
 * accident and changes what every store's header renders.
 */

import {
  defaultHeaderNav,
  isSafeNavHref,
  MAX_NAV_CHILDREN,
  MAX_NAV_ITEMS,
  navItemSchema,
  resolveFooterNav,
  resolveHeaderNav,
  resolveNavHref,
  storeNavigationSchema,
} from '../navigation';

describe('isSafeNavHref', () => {
  it('accepts store-relative paths', () => {
    for (const href of ['/products', '/pages/about', '/', '/products?category=mugs']) {
      expect(isSafeNavHref(href)).toBe(true);
    }
  });

  it('accepts external links in the schemes a merchant legitimately uses', () => {
    for (const href of [
      'https://instagram.com/acme',
      'http://example.com',
      'mailto:hi@acme.com',
      'tel:+15555550123',
    ]) {
      expect(isSafeNavHref(href)).toBe(true);
    }
  });

  it('rejects script-bearing schemes', () => {
    for (const href of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      expect(`${href} -> ${isSafeNavHref(href)}`).toBe(`${href} -> false`);
    }
  });

  it('rejects protocol-relative URLs, which look relative and are not', () => {
    // The case a naive `startsWith('/')` check waves straight through:
    // `//evil.example` is an absolute URL to another origin.
    expect(isSafeNavHref('//evil.example')).toBe(false);
    expect(isSafeNavHref('//evil.example/path')).toBe(false);
  });

  it('rejects empty, whitespace-only and absurdly long values', () => {
    expect(isSafeNavHref('')).toBe(false);
    expect(isSafeNavHref('   ')).toBe(false);
    expect(isSafeNavHref(`/${'a'.repeat(3000)}`)).toBe(false);
  });

  it('rejects bare text that is neither a path nor a URL', () => {
    expect(isSafeNavHref('products')).toBe(false);
    expect(isSafeNavHref('about us')).toBe(false);
  });
});

describe('resolveNavHref', () => {
  it('mounts relative paths under the store base', () => {
    expect(resolveNavHref('acme', '/products')).toBe('/store/acme/products');
    expect(resolveNavHref('acme', '/pages/about')).toBe('/store/acme/pages/about');
  });

  it('maps a bare slash to the store home page rather than the platform root', () => {
    expect(resolveNavHref('acme', '/')).toBe('/store/acme');
  });

  it('passes external URLs through untouched', () => {
    expect(resolveNavHref('acme', 'https://instagram.com/acme')).toBe('https://instagram.com/acme');
    expect(resolveNavHref('acme', 'mailto:hi@acme.com')).toBe('mailto:hi@acme.com');
  });

  it('collapses an unsafe href to the store home rather than emitting it', () => {
    // A link that goes somewhere harmless is a better failure than an anchor
    // carrying a hostile scheme.
    expect(resolveNavHref('acme', 'javascript:alert(1)')).toBe('/store/acme');
    expect(resolveNavHref('acme', '//evil.example')).toBe('/store/acme');
  });
});

describe('navigation schemas', () => {
  it('rejects a menu item whose href carries a script scheme', () => {
    const result = navItemSchema.safeParse({ label: 'Click', href: 'javascript:alert(1)' });
    expect(result.success).toBe(false);
  });

  it('accepts one level of children and refuses a second', () => {
    const oneLevel = navItemSchema.safeParse({
      label: 'Shop',
      href: '/products',
      children: [{ label: 'Mugs', href: '/products?category=mugs' }],
    });
    expect(oneLevel.success).toBe(true);

    const twoLevels = navItemSchema.safeParse({
      label: 'Shop',
      href: '/products',
      children: [
        {
          label: 'Mugs',
          href: '/products?category=mugs',
          children: [{ label: 'Large', href: '/products?category=large' }],
        },
      ],
    });
    expect(twoLevels.success).toBe(false);
  });

  it('caps menu and child counts', () => {
    const item = { label: 'x', href: '/products' };
    expect(
      storeNavigationSchema.safeParse({ header: Array(MAX_NAV_ITEMS).fill(item) }).success,
    ).toBe(true);
    expect(
      storeNavigationSchema.safeParse({ header: Array(MAX_NAV_ITEMS + 1).fill(item) }).success,
    ).toBe(false);
    expect(
      navItemSchema.safeParse({ ...item, children: Array(MAX_NAV_CHILDREN + 1).fill(item) }).success,
    ).toBe(false);
  });

  it('rejects unknown keys so a typo cannot persist into JSONB', () => {
    expect(
      navItemSchema.safeParse({ label: 'x', href: '/products', taget: '_blank' }).success,
    ).toBe(false);
  });

  it('accepts an empty menu — a merchant choosing to have no nav', () => {
    expect(storeNavigationSchema.safeParse({ header: [] }).success).toBe(true);
  });
});

describe('resolving a menu for a render', () => {
  const categories = [
    { name: 'Mugs', slug: 'mugs' },
    { name: 'Bowls', slug: 'bowls' },
    { name: 'Plates', slug: 'plates' },
    { name: 'Vases', slug: 'vases' },
    { name: 'Trays', slug: 'trays' },
  ];

  it('derives the previous hardcoded menu when the merchant has never edited one', () => {
    // This migration must not have changed any existing shop's header, so the
    // fallback has to reproduce "Shop all" plus the first four categories.
    const derived = resolveHeaderNav(undefined, categories);
    expect(derived.map((item) => item.label)).toEqual([
      'Shop all',
      'Mugs',
      'Bowls',
      'Plates',
      'Vases',
    ]);
    expect(derived).toEqual(defaultHeaderNav(categories));
  });

  it('treats an empty object the same as never-edited', () => {
    expect(resolveHeaderNav({}, categories)).toEqual(defaultHeaderNav(categories));
  });

  it('distinguishes "no menu set" from "a menu deliberately left empty"', () => {
    // The distinction is the whole reason `header` is optional rather than
    // defaulting to []. Collapsing them would make it impossible for a
    // merchant to turn their nav off.
    expect(resolveHeaderNav({ header: [] }, categories)).toEqual([]);
    expect(resolveHeaderNav(undefined, categories).length).toBeGreaterThan(0);
  });

  it('uses the merchant menu when they have set one', () => {
    const header = [{ label: 'Lookbook', href: '/pages/lookbook' }];
    expect(resolveHeaderNav({ header }, categories)).toEqual(header);
  });

  it('falls the footer back to categories rather than to the header menu', () => {
    // Inheriting a header built for a top nav would produce a footer full of
    // external links where a category index belongs.
    const header = [{ label: 'Instagram', href: 'https://instagram.com/acme' }];
    expect(resolveFooterNav({ header }, categories)).toEqual(defaultHeaderNav(categories));
  });

  it('encodes category slugs into the derived hrefs', () => {
    const derived = defaultHeaderNav([{ name: 'Odds & Ends', slug: 'odds & ends' }]);
    expect(derived[1].href).toBe('/products?category=odds%20%26%20ends');
  });
});
