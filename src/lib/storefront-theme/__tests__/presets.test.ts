/**
 * Preset tests.
 *
 * The point of these is to keep the six presets from collapsing into one design
 * painted six colours: every structural axis must actually vary across the set.
 */

import { FONTS } from '../fonts';
import {
  LEGACY_THEME_MAP,
  PRESETS,
  PRESET_IDS,
  PRESET_LIST,
  getPreset,
  presetSections,
  themeFromLegacyName,
} from '../presets';
import { resolveTheme } from '../resolve';
import { SECTION_REGISTRY, normalizeSections } from '../sections';
import { sectionsSchema, storefrontThemeInputSchema } from '../types';

describe('preset registry', () => {
  it('ships the six presets the contract names', () => {
    expect(PRESET_IDS).toEqual(['studio', 'voltage', 'bloom', 'depot', 'marquee', 'fresh']);
    expect(PRESET_LIST).toHaveLength(6);
  });

  it('gives every preset a name, description and register', () => {
    for (const preset of PRESET_LIST) {
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(20);
      expect(preset.register.length).toBeGreaterThan(0);
    }
  });

  it('gives every preset the data a thumbnail needs', () => {
    for (const preset of PRESET_LIST) {
      const t = preset.thumbnail;
      for (const color of [t.background, t.surface, t.brand, t.onBrand, t.text, t.textMuted, t.border]) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(typeof t.radiusPx).toBe('number');
      expect(FONTS[t.headingFont]).toBeDefined();
      expect(FONTS[t.bodyFont]).toBeDefined();
    }
  });

  it('validates every preset theme against the wire schema', () => {
    for (const preset of PRESET_LIST) {
      const result = storefrontThemeInputSchema.safeParse(preset.theme);
      expect(result.success ? 'ok' : JSON.stringify(result.error.issues)).toBe('ok');
    }
  });

  it('stamps each preset theme with its own id', () => {
    for (const id of PRESET_IDS) expect(PRESETS[id].theme.preset).toBe(id);
  });

  it('returns undefined for unknown ids', () => {
    expect(getPreset('nope')).toBeUndefined();
    expect(getPreset(undefined)).toBeUndefined();
  });

  it('only uses curated fonts', () => {
    for (const preset of PRESET_LIST) {
      expect(FONTS[preset.theme.typography.headingFont]).toBeDefined();
      expect(FONTS[preset.theme.typography.bodyFont]).toBeDefined();
    }
  });
});

describe('presets are six designs, not six hues', () => {
  /**
   * Collect the distinct values of one structural axis across all presets.
   * @param pick - Accessor for the axis
   * @returns The set of distinct values
   */
  function spread<T>(pick: (p: (typeof PRESET_LIST)[number]) => T): Set<T> {
    return new Set(PRESET_LIST.map(pick));
  }

  it('varies the font pairing', () => {
    const pairs = spread(
      (p) => `${p.theme.typography.headingFont}/${p.theme.typography.bodyFont}`,
    );
    expect(pairs.size).toBe(6);
  });

  it('varies the type scale', () => {
    expect(spread((p) => p.theme.typography.scale).size).toBeGreaterThanOrEqual(3);
  });

  it('varies corner radius', () => {
    expect(spread((p) => p.theme.shape.radius).size).toBeGreaterThanOrEqual(4);
  });

  it('varies border width', () => {
    expect(spread((p) => p.theme.shape.borderWidth).size).toBeGreaterThanOrEqual(2);
  });

  it('varies elevation', () => {
    expect(spread((p) => p.theme.shape.shadow).size).toBeGreaterThanOrEqual(3);
  });

  it('varies density', () => {
    expect(spread((p) => p.theme.shape.density).size).toBeGreaterThanOrEqual(3);
  });

  it('varies button treatment', () => {
    expect(spread((p) => `${p.theme.buttons.style}/${p.theme.buttons.uppercase}`).size).toBeGreaterThanOrEqual(4);
  });

  it('varies product card geometry', () => {
    const cards = spread(
      (p) =>
        `${p.theme.productCard.imageRatio}/${p.theme.productCard.imageFit}/${p.theme.productCard.align}/${p.theme.productCard.hoverEffect}`,
    );
    expect(cards.size).toBe(6);
  });

  it('varies header layout', () => {
    expect(spread((p) => p.theme.header.layout).size).toBe(3);
  });

  it('varies footer layout', () => {
    expect(spread((p) => p.theme.footer.layout).size).toBe(2);
  });

  it('includes at least one dark-ground design', () => {
    expect(PRESET_LIST.some((p) => p.theme.brand.scheme === 'dark')).toBe(true);
  });

  it('gives every preset its own section composition', () => {
    const compositions = spread((p) => JSON.stringify(p.sections));
    expect(compositions.size).toBe(6);
  });

  it('varies the *order and choice* of sections, not only their copy', () => {
    // Two presets could carry different words in the same seven boxes and still
    // be one design. The sequence of types is the composition itself.
    const sequences = spread((p) => p.sections.map((s) => s.type).join(' > '));
    expect(sequences.size).toBe(6);
  });

  it('opens each preset on a headline of its own', () => {
    const headlines = PRESET_LIST.map((p) => {
      const hero = p.sections.find((section) => section.type === 'hero');
      expect(hero).toBeDefined();
      return String(hero?.settings.heading ?? '');
    });
    for (const headline of headlines) expect(headline.length).toBeGreaterThan(10);
    expect(new Set(headlines).size).toBe(6);
  });

  it('makes every preset structurally distinct from every other', () => {
    const fingerprints = PRESET_LIST.map((p) =>
      JSON.stringify({
        typography: p.theme.typography,
        shape: p.theme.shape,
        buttons: p.theme.buttons,
        productCard: p.theme.productCard,
        header: { layout: p.theme.header.layout, sticky: p.theme.header.sticky },
        footer: p.theme.footer,
      }),
    );
    expect(new Set(fingerprints).size).toBe(6);
  });
});

describe('preset section compositions', () => {
  it('ships a usable home page with every preset', () => {
    for (const preset of PRESET_LIST) {
      expect(preset.sections.length).toBeGreaterThan(3);
      const parsed = sectionsSchema.safeParse(preset.sections);
      expect(parsed.success ? 'ok' : JSON.stringify(parsed.error.issues)).toBe('ok');
    }
  });

  it('survives the same normalisation a stored section list goes through', () => {
    for (const preset of PRESET_LIST) {
      const { sections, problems } = normalizeSections(preset.sections);
      expect(problems).toEqual([]);
      expect(sections).toHaveLength(preset.sections.length);
    }
  });

  it('respects each section type\'s per-page cap', () => {
    for (const preset of PRESET_LIST) {
      const counts = new Map<string, number>();
      for (const section of preset.sections) {
        counts.set(section.type, (counts.get(section.type) ?? 0) + 1);
      }
      for (const [type, count] of counts) {
        expect(count).toBeLessThanOrEqual(SECTION_REGISTRY[type as never].maxPerPage);
      }
    }
  });

  it('leads with a hero and enables every section it ships', () => {
    for (const preset of PRESET_LIST) {
      expect(preset.sections[0].type).toBe('hero');
      expect(preset.sections.every((section) => section.enabled)).toBe(true);
    }
  });

  it('hands out a deep copy so one store cannot edit the shipped preset', () => {
    const first = presetSections('voltage');
    first[0].settings.heading = 'mutated';
    first.pop();
    expect(presetSections('voltage')[0].settings.heading).not.toBe('mutated');
    expect(presetSections('voltage')).toHaveLength(PRESETS.voltage.sections.length);
    expect(PRESETS.voltage.sections[0].settings.heading).not.toBe('mutated');
  });

  it('falls back to the generic starter page for an unknown preset', () => {
    expect(presetSections('who-knows').length).toBeGreaterThan(0);
    expect(presetSections(undefined).length).toBeGreaterThan(0);
  });

  it('leaves hero art to the store so a merchant sees their own photograph', () => {
    for (const preset of PRESET_LIST) {
      const hero = preset.sections.find((section) => section.type === 'hero');
      expect(hero?.settings.image).toBe('');
    }
  });
});

describe('legacy theme migration', () => {
  it('maps all ten legacy swatches', () => {
    expect(Object.keys(LEGACY_THEME_MAP).sort()).toEqual(
      ['amber', 'crimson', 'dark', 'default', 'ocean', 'purple', 'rose', 'slate', 'sunset', 'teal'].sort(),
    );
  });

  it('maps every legacy name onto a real preset', () => {
    for (const mapping of Object.values(LEGACY_THEME_MAP)) {
      expect(getPreset(mapping.preset)).toBeDefined();
    }
  });

  it('produces a resolvable theme for every legacy name', () => {
    for (const name of Object.keys(LEGACY_THEME_MAP)) {
      const patch = themeFromLegacyName(name);
      const theme = resolveTheme(patch);
      expect(theme.brand.color).toBe(LEGACY_THEME_MAP[name].brandColor);
      expect(theme.brand.colorOnBrand).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('falls back to the default mapping for unknown or missing names', () => {
    expect(themeFromLegacyName('who-knows').preset).toBe(LEGACY_THEME_MAP.default.preset);
    expect(themeFromLegacyName(null).preset).toBe(LEGACY_THEME_MAP.default.preset);
    expect(themeFromLegacyName(undefined).preset).toBe(LEGACY_THEME_MAP.default.preset);
  });

  it('keeps the dark swatch dark', () => {
    expect(resolveTheme(themeFromLegacyName('dark')).brand.scheme).toBe('dark');
  });
});
