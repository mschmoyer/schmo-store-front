/**
 * Pure preset ↔ legacy-theme mapping.
 *
 * Lives outside `src/app/api/onboarding/_lib/theme.ts` so it can be imported
 * (and tested) without pulling in the Postgres driver.
 */

import { LEGACY_THEME_MAP } from '@/lib/storefront-theme/presets';

/**
 * Reverse the legacy map: given a preset id, find the legacy `theme_name` that
 * maps onto it, so an older renderer still shows something close to the
 * merchant's choice on a deploy where migration 019 has not run.
 *
 * @param presetId - Chosen preset
 * @returns A legacy theme name, defaulting to `default`
 */
export function legacyNameForPreset(presetId: string): string {
  const match = Object.entries(LEGACY_THEME_MAP).find(([, value]) => value.preset === presetId);
  return match?.[0] ?? 'default';
}
