/**
 * The preset-to-storage mapping.
 *
 * `persistTheme` itself touches the database, so what is unit-testable here is
 * the pure half: the reverse legacy mapping that keeps a merchant's choice
 * recognisable on a deploy where migration 019 has not run. The storage
 * decision itself is exercised end-to-end against the live database during
 * manual verification.
 */

import { legacyNameForPreset } from '@/components/onboarding/lib/theme-mapping';
import { LEGACY_THEME_MAP, PRESET_IDS, getPreset } from '@/lib/storefront-theme/presets';

describe('legacyNameForPreset', () => {
  it('returns a legacy name that maps back to the same preset', () => {
    for (const presetId of PRESET_IDS) {
      const legacy = legacyNameForPreset(presetId);
      const mapping = LEGACY_THEME_MAP[legacy];
      expect(mapping).toBeDefined();
      // Every preset that appears in the legacy map must round-trip.
      if (Object.values(LEGACY_THEME_MAP).some((entry) => entry.preset === presetId)) {
        expect(mapping.preset).toBe(presetId);
      }
    }
  });

  it('falls back to `default` for a preset with no legacy equivalent', () => {
    expect(legacyNameForPreset('not-a-preset')).toBe('default');
  });

  it('always returns a name the legacy map knows', () => {
    for (const presetId of [...PRESET_IDS, 'nonsense']) {
      expect(LEGACY_THEME_MAP[legacyNameForPreset(presetId)]).toBeDefined();
    }
  });
});

describe('preset catalogue', () => {
  it('offers exactly the six shipped looks the wizard renders', () => {
    expect([...PRESET_IDS]).toEqual(['studio', 'voltage', 'bloom', 'depot', 'marquee', 'fresh']);
  });

  it('gives every preset the thumbnail data the wizard draws from', () => {
    for (const presetId of PRESET_IDS) {
      const preset = getPreset(presetId);
      expect(preset).toBeDefined();
      const thumbnail = preset!.thumbnail;
      for (const key of ['background', 'surface', 'brand', 'text', 'border'] as const) {
        expect(thumbnail[key]).toMatch(/^#/);
      }
      expect(typeof thumbnail.radiusPx).toBe('number');
      expect(['square', 'portrait', 'landscape']).toContain(thumbnail.imageRatio);
      expect(['logo-left', 'logo-center', 'logo-left-nav-below']).toContain(
        thumbnail.headerLayout
      );
    }
  });

  it('rejects an unknown preset id', () => {
    expect(getPreset('voltage-x')).toBeUndefined();
    expect(getPreset('')).toBeUndefined();
  });
});
