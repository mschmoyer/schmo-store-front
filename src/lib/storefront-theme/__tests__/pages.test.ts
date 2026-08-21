/**
 * Custom page tests — slug rules and the create/update contracts.
 *
 * Slugs are the part worth testing hard: they become public URLs, they are
 * merchant-chosen, and a reserved-word collision is only discoverable after
 * somebody has printed the link on something.
 */

import {
  createPageBodySchema,
  isUsablePageSlug,
  MAX_PAGES_PER_STORE,
  pageSlugSchema,
  RESERVED_PAGE_SLUGS,
  slugifyPageTitle,
  updatePageBodySchema,
} from '../pages';

describe('slugifyPageTitle', () => {
  it('turns ordinary titles into slugs', () => {
    expect(slugifyPageTitle('Shipping & Returns')).toBe('shipping-returns');
    expect(slugifyPageTitle('About Us')).toBe('about-us');
    expect(slugifyPageTitle('  Size   Guide  ')).toBe('size-guide');
  });

  it('folds accents to their base letters rather than dropping them', () => {
    // "Café" must become "cafe", not "caf".
    expect(slugifyPageTitle('Café Menu')).toBe('cafe-menu');
    expect(slugifyPageTitle('Piñata')).toBe('pinata');
  });

  it('never emits a leading or trailing hyphen, even after truncation', () => {
    expect(slugifyPageTitle('!!! Hello !!!')).toBe('hello');
    const long = slugifyPageTitle(`${'a'.repeat(158)} bcd`);
    expect(long.endsWith('-')).toBe(false);
    expect(long.length).toBeLessThanOrEqual(160);
  });

  it('returns an empty string when there is nothing usable', () => {
    expect(slugifyPageTitle('!!!')).toBe('');
    expect(slugifyPageTitle('')).toBe('');
  });

  it('produces slugs its own validator accepts', () => {
    for (const title of ['Shipping & Returns', 'FAQ', 'Our Story — 2026', 'Café']) {
      const slug = slugifyPageTitle(title);
      expect(`${title} -> ${slug}: ${isUsablePageSlug(slug)}`).toBe(`${title} -> ${slug}: true`);
    }
  });
});

describe('page slugs', () => {
  it('accepts hyphen-separated lowercase words', () => {
    for (const slug of ['about', 'shipping-returns', 'size-guide-2026']) {
      expect(pageSlugSchema.safeParse(slug).success).toBe(true);
    }
  });

  it('rejects shapes that would produce an ambiguous or ugly URL', () => {
    for (const slug of [
      'About',
      'about us',
      'about_us',
      '-about',
      'about-',
      'about--us',
      'about/us',
      '',
      'a'.repeat(161),
    ]) {
      expect(`${slug || '<empty>'}: ${pageSlugSchema.safeParse(slug).success}`).toBe(
        `${slug || '<empty>'}: false`,
      );
    }
  });

  it('refuses every reserved slug', () => {
    for (const slug of RESERVED_PAGE_SLUGS) {
      expect(`${slug}: ${pageSlugSchema.safeParse(slug).success}`).toBe(`${slug}: false`);
      expect(isUsablePageSlug(slug)).toBe(false);
    }
  });

  it('reserves the routes that become ambiguous on a custom domain', () => {
    // Today pages live at /store/<store>/pages/<slug>, so these cannot collide.
    // They are reserved for the day the storefront moves to a domain root —
    // by which point a merchant has printed the URL on something.
    for (const slug of ['cart', 'checkout', 'products', 'account', 'admin', 'api']) {
      expect(RESERVED_PAGE_SLUGS).toContain(slug);
    }
  });
});

describe('create and update contracts', () => {
  it('accepts a minimal create', () => {
    const result = createPageBodySchema.safeParse({ slug: 'about', title: 'About us' });
    expect(result.success).toBe(true);
  });

  it('requires both a slug and a title', () => {
    expect(createPageBodySchema.safeParse({ slug: 'about' }).success).toBe(false);
    expect(createPageBodySchema.safeParse({ title: 'About us' }).success).toBe(false);
    expect(createPageBodySchema.safeParse({ slug: 'about', title: '   ' }).success).toBe(false);
  });

  it('refuses to update a page to a new slug', () => {
    // Changing a page's URL after it has been linked, indexed or printed
    // breaks those links silently, so renaming is deliberately create + delete.
    expect(updatePageBodySchema.safeParse({ slug: 'renamed' }).success).toBe(false);
  });

  it('refuses an update that changes nothing', () => {
    expect(updatePageBodySchema.safeParse({}).success).toBe(false);
  });

  it('accepts a partial update of any single field', () => {
    expect(updatePageBodySchema.safeParse({ title: 'New title' }).success).toBe(true);
    expect(updatePageBodySchema.safeParse({ sections: [] }).success).toBe(true);
    expect(updatePageBodySchema.safeParse({ seo: { noindex: true } }).success).toBe(true);
  });

  it('rejects unknown keys rather than silently dropping them', () => {
    expect(
      createPageBodySchema.safeParse({ slug: 'about', title: 'About', publish: true }).success,
    ).toBe(false);
  });

  it('caps pages per store at a documented number', () => {
    expect(MAX_PAGES_PER_STORE).toBeGreaterThan(10);
    expect(Number.isInteger(MAX_PAGES_PER_STORE)).toBe(true);
  });
});
