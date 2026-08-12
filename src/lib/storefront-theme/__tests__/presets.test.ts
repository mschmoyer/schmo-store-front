/**
 * Preset tests.
 *
 * The point of these is to keep the six presets from collapsing into one design
 * painted six colours: every structural axis must actually vary across the set.
 */

import { FONTS } from '../fonts';
import { LEGACY_THEME_MAP, PRESETS, PRESET_IDS, PRESET_LIST, getPreset, themeFromLegacyName } from '../presets';
import { resolveTheme } from '../resolve';
import { storefrontThemeInputSchema } from '../types';

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
