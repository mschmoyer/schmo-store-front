/**
 * Resolution and CSS emission tests.
 *
 * Covers the three invariants `resolve.ts` must never break: auto-contrast,
 * determinism, and no leakage (`:root` / `!important` / unscoped rules).
 */

import { contrastRatio, oklchToHex } from '../color';
import { BASE_THEME, DENSITY_MULTIPLIER, SCALE_MULTIPLIER } from '../defaults';
import { PRESET_IDS, PRESETS } from '../presets';
import {
  auditContrast,
  deepMerge,
  deriveTokens,
  fmt,
  resolveTheme,
  storefrontScope,
  themeToCss,
  themeToStyleSheet,
} from '../resolve';

/**
 * The custom properties `docs/storefront-theme-spec.md` section 3 requires,
 * transcribed by hand from the contract.
 *
 * This list is the renderer's guarantee. `themeToCss` must emit exactly these —
 * dropping one breaks the storefront, adding one means the contract changed and
 * the spec needs updating first.
 */
const SPEC_CUSTOM_PROPERTIES: readonly string[] = [
  '--st-brand',
  '--st-brand-hover',
  '--st-brand-active',
  '--st-on-brand',

  '--st-surface',
  '--st-surface-raised',
  '--st-surface-sunken',
  '--st-overlay',

  '--st-text',
  '--st-text-muted',
  '--st-text-on-brand',

  '--st-border',
  '--st-border-strong',

  '--st-success',
  '--st-warning',
  '--st-danger',

  '--st-font-heading',
  '--st-font-body',

  '--st-h1',
  '--st-h2',
  '--st-h3',
  '--st-h4',
  '--st-h5',
  '--st-h6',
  '--st-body',
  '--st-small',

  '--st-heading-weight',
  '--st-heading-case',
  '--st-heading-tracking',

  '--st-radius-card',
  '--st-radius-button',
  '--st-radius-input',
  '--st-radius-image',

  '--st-border-width',

  '--st-shadow-card',
  '--st-shadow-card-hover',
  '--st-shadow-popover',

  '--st-space-1',
  '--st-space-2',
  '--st-space-3',
  '--st-space-4',
  '--st-space-5',
  '--st-space-6',
  '--st-space-7',
  '--st-space-8',
  '--st-space-9',
  '--st-space-10',
  '--st-space-11',
  '--st-space-12',

  '--st-ratio-product',
  '--st-container',
];

const SCOPE = '.storefront[data-store-id="s1"]';

/**
 * Pull the custom-property names out of an emitted token block.
 * @param css - CSS produced by `themeToCss`
 * @returns Property names in emission order
 */
function propertyNames(css: string): string[] {
  return Array.from(css.matchAll(/^\s*(--[a-z0-9-]+):/gm)).map((m) => m[1]);
}

/**
 * Read one custom property value out of an emitted token block.
 * @param css - CSS produced by `themeToCss`
 * @param name - Property name including the leading dashes
 * @returns The value, or undefined
 */
function value(css: string, name: string): string | undefined {
  const match = new RegExp(`${name}:\\s*(.+);`).exec(css);
  return match?.[1];
}

describe('deepMerge', () => {
  it('merges nested objects without mutating the base', () => {
    const base = { a: { b: 1, c: 2 }, d: 3 };
    const out = deepMerge(base, { a: { c: 9 } });
    expect(out).toEqual({ a: { b: 1, c: 9 }, d: 3 });
    expect(base.a.c).toBe(2);
  });

  it('ignores undefined values', () => {
    expect(deepMerge({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
  });

  it('replaces arrays wholesale rather than merging them', () => {
    expect(deepMerge({ a: [1, 2, 3] }, { a: [9] })).toEqual({ a: [9] });
  });

  it('refuses prototype-polluting keys', () => {
    const payload = JSON.parse('{"__proto__": {"polluted": true}}');
    deepMerge({ safe: true }, payload);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('resolveTheme', () => {
  it('returns a complete theme for an empty patch', () => {
    const theme = resolveTheme({});
    expect(theme.version).toBe(1);
    expect(theme.brand.color).toBe(BASE_THEME.brand.color);
    expect(theme.brand.colorOnBrand).toMatch(/^#[0-9a-f]{6}$/);
    expect(theme.header.announcement).toBeDefined();
  });

  it('handles null and undefined input', () => {
    expect(resolveTheme(null).version).toBe(1);
    expect(resolveTheme(undefined).version).toBe(1);
  });

  it('applies a preset then the merchant overrides on top', () => {
    const theme = resolveTheme({ preset: 'voltage', brand: { color: '#ff0000' } });
    expect(theme.brand.scheme).toBe('dark');
    expect(theme.shape.radius).toBe('square');
    expect(theme.brand.color).toBe('#ff0000');
  });

  it('ignores an unknown preset rather than throwing', () => {
    const theme = resolveTheme({ preset: 'no-such-preset' });
    expect(theme.preset).toBe('no-such-preset');
    expect(theme.brand.color).toBe(BASE_THEME.brand.color);
  });

  it('honours an explicitly set colorOnBrand', () => {
    expect(resolveTheme({ brand: { colorOnBrand: '#123456' } }).brand.colorOnBrand).toBe('#123456');
  });

  it('is deterministic', () => {
    expect(resolveTheme({ preset: 'bloom' })).toEqual(resolveTheme({ preset: 'bloom' }));
  });
});

describe('themeToCss — emitted property set', () => {
  const css = themeToCss(resolveTheme({}), SCOPE);

  it('emits exactly the properties the contract lists, once each', () => {
    const emitted = propertyNames(css);
    expect(new Set(emitted).size).toBe(emitted.length);
    expect([...emitted].sort()).toEqual([...SPEC_CUSTOM_PROPERTIES].sort());
  });

  it('scopes to the given selector and never to :root', () => {
    expect(css.startsWith(`${SCOPE} {`)).toBe(true);
    expect(css).not.toContain(':root');
  });

  it('never uses !important', () => {
    expect(css.toLowerCase()).not.toContain('!important');
  });

  it('falls back to a safe scope when handed an empty selector', () => {
    expect(themeToCss(resolveTheme({}), '   ').startsWith('.storefront {')).toBe(true);
  });

  it('accepts a partial theme by resolving it first', () => {
    expect(themeToCss({ preset: 'fresh' }, SCOPE)).toBe(
      themeToCss(resolveTheme({ preset: 'fresh' }), SCOPE),
    );
  });
});

describe('themeToCss — determinism', () => {
  it('produces byte-identical output for the same input', () => {
    for (const id of PRESET_IDS) {
      const theme = resolveTheme({ preset: id });
      expect(themeToCss(theme, SCOPE)).toBe(themeToCss(theme, SCOPE));
    }
  });

  it('produces the same output from a re-resolved theme', () => {
    const once = resolveTheme({ preset: 'studio' });
    const twice = resolveTheme(JSON.parse(JSON.stringify(once)));
    expect(themeToCss(twice, SCOPE)).toBe(themeToCss(once, SCOPE));
  });

  it('never emits NaN, undefined or empty values', () => {
    for (const id of PRESET_IDS) {
      const css = themeToCss(resolveTheme({ preset: id }), SCOPE);
      expect(css).not.toMatch(/NaN/);
      expect(css).not.toMatch(/undefined/);
      expect(css).not.toMatch(/:\s*;/);
    }
  });
});

describe('themeToCss — ramps', () => {
  it('applies the density multiplier to the space ramp', () => {
    for (const density of ['compact', 'default', 'roomy'] as const) {
      const css = themeToCss(resolveTheme({ shape: { density } }), SCOPE);
      expect(value(css, '--st-space-4')).toBe(`${fmt(16 * DENSITY_MULTIPLIER[density])}px`);
      expect(value(css, '--st-space-12')).toBe(`${fmt(96 * DENSITY_MULTIPLIER[density])}px`);
    }
  });

  it('emits all twelve space steps', () => {
    const css = themeToCss(resolveTheme({}), SCOPE);
    for (let i = 1; i <= 12; i += 1) expect(value(css, `--st-space-${i}`)).toBeDefined();
  });

  it('applies the type scale multiplier to the type ramp', () => {
    for (const scale of ['compact', 'default', 'spacious'] as const) {
      const css = themeToCss(resolveTheme({ typography: { scale } }), SCOPE);
      expect(value(css, '--st-body')).toBe(`${fmt(1 * SCALE_MULTIPLIER[scale])}rem`);
      expect(value(css, '--st-h1')).toContain('clamp(');
    }
  });

  it('maps radius styles onto the documented pixel values', () => {
    expect(value(themeToCss(resolveTheme({ shape: { radius: 'square' } }), SCOPE), '--st-radius-button')).toBe('0px');
    expect(value(themeToCss(resolveTheme({ shape: { radius: 'soft' } }), SCOPE), '--st-radius-button')).toBe('8px');
    expect(value(themeToCss(resolveTheme({ shape: { radius: 'rounded' } }), SCOPE), '--st-radius-button')).toBe('16px');
    expect(value(themeToCss(resolveTheme({ shape: { radius: 'pill' } }), SCOPE), '--st-radius-button')).toBe('999px');
  });

  it('caps card radius so a pill theme does not produce lozenge cards', () => {
    const css = themeToCss(resolveTheme({ shape: { radius: 'pill' } }), SCOPE);
    expect(value(css, '--st-radius-card')).toBe('24px');
    expect(value(css, '--st-radius-image')).toBe('20px');
  });

  it('maps product ratios onto aspect-ratio values', () => {
    expect(value(themeToCss(resolveTheme({ productCard: { imageRatio: 'portrait' } }), SCOPE), '--st-ratio-product')).toBe('3 / 4');
    expect(value(themeToCss(resolveTheme({ productCard: { imageRatio: 'landscape' } }), SCOPE), '--st-ratio-product')).toBe('4 / 3');
  });

  it('clamps heading tracking into the documented range', () => {
    const css = themeToCss(resolveTheme({ typography: { headingTracking: 9 } }), SCOPE);
    expect(value(css, '--st-heading-tracking')).toBe('0.04em');
  });

  it('resolves fonts to a stack that references the next/font variable', () => {
    const css = themeToCss(resolveTheme({ typography: { headingFont: 'fraunces' } }), SCOPE);
    expect(value(css, '--st-font-heading')).toContain('var(--st-font-fraunces)');
    expect(value(css, '--st-font-heading')).toContain('serif');
  });
});

describe('themeToCss — shadows', () => {
  it('emits none for card shadows but keeps popovers elevated', () => {
    const css = themeToCss(resolveTheme({ shape: { shadow: 'none' } }), SCOPE);
    expect(value(css, '--st-shadow-card')).toBe('none');
    expect(value(css, '--st-shadow-popover')).not.toBe('none');
  });

  it('uses inset rings rather than drop shadows on dark grounds', () => {
    const css = themeToCss(resolveTheme({ preset: 'voltage', shape: { shadow: 'subtle' } }), SCOPE);
    expect(value(css, '--st-shadow-card')).toContain('inset');
  });

  it('tints shadows with the surface hue', () => {
    const warm = themeToCss(resolveTheme({ brand: { surface: '#faf7f2' }, shape: { shadow: 'subtle' } }), SCOPE);
    const cool = themeToCss(resolveTheme({ brand: { surface: '#f0f4ff' }, shape: { shadow: 'subtle' } }), SCOPE);
    expect(value(warm, '--st-shadow-card')).not.toBe(value(cool, '--st-shadow-card'));
  });
});

describe('auto-contrast in the resolved theme', () => {
  it('passes the full audit for every shipped preset', () => {
    for (const id of PRESET_IDS) {
      for (const row of auditContrast(resolveTheme({ preset: id }))) {
        expect(`${id}: ${row.pair} ${row.ratio}`).toBe(
          row.passes ? `${id}: ${row.pair} ${row.ratio}` : 'FAILED',
        );
      }
    }
  });

  it('flips button ink to dark for a pale yellow brand', () => {
    const theme = resolveTheme({ brand: { color: '#fff176' } });
    expect(contrastRatio(theme.brand.colorOnBrand, '#fff176')).toBeGreaterThanOrEqual(4.5);
  });

  it('flips button ink to light for a near-black brand', () => {
    const theme = resolveTheme({ brand: { color: '#0b0b0b' } });
    expect(contrastRatio(theme.brand.colorOnBrand, '#0b0b0b')).toBeGreaterThanOrEqual(4.5);
  });

  it('holds for an exhaustive sweep of merchant brand colours', () => {
    const failures: string[] = [];
    for (let h = 0; h < 360; h += 13) {
      for (let l = 0.08; l <= 0.96; l += 0.08) {
        const brand = oklchToHex({ l, c: 0.15, h });
        for (const row of auditContrast(resolveTheme({ brand: { color: brand } }))) {
          if (!row.passes) failures.push(`${brand} ${row.pair} ${row.ratio}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('rescues an unreadable merchant text colour', () => {
    const tokens = deriveTokens(resolveTheme({ brand: { surface: '#ffffff', text: '#f4f4f4' } }));
    expect(contrastRatio(tokens.text, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('rescues an invisible merchant muted text colour', () => {
    const tokens = deriveTokens(resolveTheme({ brand: { surface: '#ffffff', textMuted: '#eeeeee' } }));
    expect(contrastRatio(tokens.textMuted, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('rescues invisible status colours', () => {
    const tokens = deriveTokens(
      resolveTheme({ brand: { surface: '#ffffff', success: '#f0fff8', danger: '#fff5f5' } }),
    );
    expect(contrastRatio(tokens.success, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(tokens.danger, '#ffffff')).toBeGreaterThanOrEqual(3);
  });
});

describe('themeToStyleSheet', () => {
  it('appends sanitized custom CSS after the token block', () => {
    const theme = resolveTheme({ custom: { css: '.a { color: red }' } });
    const { css } = themeToStyleSheet(theme, SCOPE);
    expect(css).toContain('--st-brand');
    expect(css).toContain(`${SCOPE} .a {`);
  });

  it('drops hostile custom CSS and reports it', () => {
    const theme = resolveTheme({ custom: { css: '@import url(https://evil.test/x.css);' } });
    const { css, custom } = themeToStyleSheet(theme, SCOPE);
    expect(css).not.toContain('evil.test');
    expect(custom.warnings.length).toBeGreaterThan(0);
  });

  it('emits just the token block when there is no custom CSS', () => {
    const theme = resolveTheme({});
    expect(themeToStyleSheet(theme, SCOPE).css).toBe(themeToCss(theme, SCOPE));
  });
});

describe('storefrontScope', () => {
  it('produces a data-attribute selector', () => {
    expect(storefrontScope('650e8400-e29b-41d4-a716-446655440001')).toBe(
      '.storefront[data-store-id="650e8400-e29b-41d4-a716-446655440001"]',
    );
  });

  it('strips anything that could break out of the attribute selector', () => {
    expect(storefrontScope('abc"] , body [x="')).toBe('.storefront[data-store-id="abcbodyx"]');
  });
});

describe('fmt', () => {
  it('trims trailing zeros and normalises negative zero', () => {
    expect(fmt(16)).toBe('16');
    expect(fmt(13.6)).toBe('13.6');
    expect(fmt(-0)).toBe('0');
    expect(fmt(Number.NaN)).toBe('0');
  });
});

describe('preset sanity', () => {
  it('every preset resolves and emits CSS', () => {
    for (const id of PRESET_IDS) {
      const css = themeToCss(resolveTheme({ preset: id }), SCOPE);
      expect(css.length).toBeGreaterThan(500);
      expect(css).toContain('--st-brand:');
    }
  });

  it('the thumbnail brand colour matches the theme', () => {
    for (const id of PRESET_IDS) {
      expect(PRESETS[id].thumbnail.brand).toBe(PRESETS[id].theme.brand.color);
    }
  });
});
