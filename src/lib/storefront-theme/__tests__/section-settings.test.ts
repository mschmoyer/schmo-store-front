/**
 * Settings coercion tests.
 *
 * `Section['settings']` is `Record<string, unknown>`, so nothing in the type
 * system stops a caller writing `hero.layout: 'centered'` — a layout this
 * renderer does not have. That defect reached the hand-written page templates
 * once. It is the *expected* output of a language model asked to compose a
 * page, which is why this function exists and why these tests are specific
 * about what survives coercion and what does not.
 */

import { SECTION_REGISTRY, coerceSectionSettings, SETTING_LIMITS } from '../sections';

describe('coerceSectionSettings', () => {
  it('fills in every declared field when given nothing', () => {
    const { settings, problems } = coerceSectionSettings('hero', undefined);
    expect(problems).toEqual([]);
    expect(settings).toEqual(SECTION_REGISTRY.hero.defaultSettings);
  });

  it('keeps values that are already legal, untouched and unreported', () => {
    const { settings, problems } = coerceSectionSettings('hero', {
      heading: 'Sourdough, baked at 5am',
      layout: 'overlay',
      height: 'large',
      overlayOpacity: 40,
    });
    expect(problems).toEqual([]);
    expect(settings.heading).toBe('Sourdough, baked at 5am');
    expect(settings.layout).toBe('overlay');
    expect(settings.overlayOpacity).toBe(40);
  });

  it('resets a select to its default when the value is not an option', () => {
    // The exact shape of the bug that shipped: plausible word, not in the enum.
    const { settings, problems } = coerceSectionSettings('hero', { layout: 'centered' });
    expect(settings.layout).toBe(SECTION_REGISTRY.hero.defaultSettings.layout);
    expect(problems.join(' ')).toMatch(/Layout/);
  });

  it('drops a setting the schema does not declare, and says so', () => {
    const { settings, problems } = coerceSectionSettings('hero', {
      heading: 'Hi',
      backgroundColor: '#ff0000',
    });
    expect(settings).not.toHaveProperty('backgroundColor');
    expect(problems.join(' ')).toMatch(/unknown setting "backgroundColor"/);
  });

  it('clamps a range instead of rejecting it', () => {
    // "6 columns" is a plausible ask and a broken render; the maximum the
    // design supports serves the merchant better than silently defaulting.
    const columns = SECTION_REGISTRY['featured-collection'].settingsSchema.find(
      (field) => field.id === 'columns',
    );
    expect(columns?.max).toBe(6);
    const { settings } = coerceSectionSettings('featured-collection', { columns: 12 });
    expect(settings.columns).toBe(6);
  });

  it('reads a numeric string as a number', () => {
    const { settings } = coerceSectionSettings('featured-collection', { limit: '6' });
    expect(settings.limit).toBe(6);
  });

  it('falls back when a range is not a number at all', () => {
    const { settings } = coerceSectionSettings('featured-collection', { limit: 'lots' });
    expect(settings.limit).toBe(SECTION_REGISTRY['featured-collection'].defaultSettings.limit);
  });

  it('reads the strings a machine sends for a boolean', () => {
    expect(coerceSectionSettings('featured-collection', { showViewAll: 'false' }).settings.showViewAll)
      .toBe(false);
    expect(coerceSectionSettings('featured-collection', { showViewAll: 'yes' }).settings.showViewAll)
      .toBe(true);
  });

  it('refuses a javascript: URL in a link field', () => {
    const { settings, problems } = coerceSectionSettings('hero', {
      primaryHref: 'javascript:alert(1)',
    });
    expect(settings.primaryHref).toBe(SECTION_REGISTRY.hero.defaultSettings.primaryHref);
    expect(problems.join(' ')).toMatch(/Button link/);
  });

  it('allows an ordinary store path and an external https link', () => {
    expect(coerceSectionSettings('hero', { primaryHref: '/pages/about' }).settings.primaryHref)
      .toBe('/pages/about');
    expect(
      coerceSectionSettings('hero', { primaryHref: 'https://example.com/lookbook' }).settings
        .primaryHref,
    ).toBe('https://example.com/lookbook');
  });

  it('refuses a javascript: or data: image and leaves the field empty', () => {
    // An image setting ends up in `src`, where these are XSS, not a bad photo.
    for (const hostile of ['javascript:alert(1)', 'data:text/html;base64,PHN2Zz4=', '//evil.example/x.png']) {
      expect(coerceSectionSettings('hero', { image: hostile }).settings.image).toBe('');
    }
  });

  it('accepts a real image URL and a site-relative path', () => {
    expect(coerceSectionSettings('hero', { image: 'https://cdn.example.com/a.jpg' }).settings.image)
      .toBe('https://cdn.example.com/a.jpg');
    expect(coerceSectionSettings('hero', { image: '/uploads/a.jpg' }).settings.image)
      .toBe('/uploads/a.jpg');
  });

  it('trims without complaining about it', () => {
    const { settings, problems } = coerceSectionSettings('hero', { heading: '  Fresh bread  ' });
    expect(settings.heading).toBe('Fresh bread');
    expect(problems).toEqual([]);
  });

  it('caps an essay written into a single-line field', () => {
    const essay = 'a'.repeat(SETTING_LIMITS.text + 500);
    const { settings, problems } = coerceSectionSettings('hero', { heading: essay });
    expect((settings.heading as string).length).toBe(SETTING_LIMITS.text);
    expect(problems.join(' ')).toMatch(/Headline/);
  });

  describe('repeatable list settings', () => {
    // `items` is declared `type: 'textarea'` but defaults to an array of
    // objects. Coercing it by its declared type would flatten three value
    // props into the string "[object Object],[object Object],[object Object]".
    it('is declared as a textarea but holds an array', () => {
      const items = SECTION_REGISTRY['value-props'].settingsSchema.find((f) => f.id === 'items');
      expect(items?.type).toBe('textarea');
      expect(Array.isArray(items?.default)).toBe(true);
    });

    it('keeps a well-formed list', () => {
      const { settings, problems } = coerceSectionSettings('value-props', {
        items: [
          { icon: 'IconTruck', title: 'Baked daily', body: 'Out of the oven by six.' },
          { icon: 'IconMapPin', title: 'Collect in store', body: 'Ready when you are.' },
        ],
      });
      expect(problems).toEqual([]);
      expect(settings.items).toHaveLength(2);
      expect((settings.items as Record<string, unknown>[])[0].title).toBe('Baked daily');
    });

    it('gives an item exactly the template keys, dropping invented ones', () => {
      const { settings } = coerceSectionSettings('value-props', {
        items: [{ icon: 'IconTruck', title: 'A', body: 'B', backgroundColor: 'red' }],
      });
      const first = (settings.items as Record<string, unknown>[])[0];
      expect(Object.keys(first).sort()).toEqual(['body', 'icon', 'title']);
    });

    it('drops an empty item rather than rendering a blank card', () => {
      const { settings } = coerceSectionSettings('value-props', {
        items: [{ icon: '', title: '', body: '' }, { icon: 'IconTruck', title: 'Real', body: 'Yes' }],
      });
      expect(settings.items).toHaveLength(1);
    });

    it('falls back to the default when nothing in the list is usable', () => {
      const { settings } = coerceSectionSettings('value-props', { items: ['just a string'] });
      expect(settings.items).toEqual(SECTION_REGISTRY['value-props'].defaultSettings.items);
    });

    it('caps a runaway list', () => {
      const many = Array.from({ length: SETTING_LIMITS.listItems + 10 }, (_, index) => ({
        icon: 'IconTruck',
        title: `Item ${index}`,
        body: 'Copy',
      }));
      const { settings } = coerceSectionSettings('value-props', { items: many });
      expect(settings.items).toHaveLength(SETTING_LIMITS.listItems);
    });

    it('accepts an empty list as a deliberate deletion', () => {
      const { settings, problems } = coerceSectionSettings('value-props', { items: [] });
      expect(settings.items).toEqual([]);
      expect(problems).toEqual([]);
    });
  });

  it('produces settings that satisfy every section type in the registry', () => {
    // A registry entry that this function cannot round-trip is a section the
    // AI composer and the importer would silently degrade.
    for (const type of Object.keys(SECTION_REGISTRY) as (keyof typeof SECTION_REGISTRY)[]) {
      const { settings, problems } = coerceSectionSettings(
        type,
        SECTION_REGISTRY[type].defaultSettings,
      );
      expect({ type, problems }).toEqual({ type, problems: [] });
      expect(settings).toEqual(SECTION_REGISTRY[type].defaultSettings);
    }
  });
});
