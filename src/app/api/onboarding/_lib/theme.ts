/**
 * Where the merchant's chosen look gets stored.
 *
 * ## The theme-engine dependency, handled honestly
 *
 * `src/lib/storefront-theme/presets.ts` exists and exports six real presets, so
 * the wizard renders real thumbnails from `PRESETS[id].thumbnail` rather than
 * six coloured rectangles.
 *
 * Its persistence layer (`storefront_themes`, migration
 * `019_storefront_themes.sql`, owned by the theme-engine track) landed while
 * this was being built. When the table is present we go through that track's own
 * `saveDraft`/`publishDraft` helpers rather than writing the table directly —
 * they seed the default section list, bump `version`, stamp `published_at` and
 * invalidate the render cache, none of which a raw INSERT here would do.
 *
 * The table is still probed at runtime rather than assumed, because a deploy
 * that has not run migration 019 must degrade to legacy `stores.theme_name`
 * instead of 500ing on the most important screen in the product.
 *
 * TODO(theme-engine): once 019 is guaranteed everywhere, delete
 * {@link tableExists} and the legacy branch; `persistTheme` becomes two calls.
 */

import { db } from '@/lib/database/connection';
import { getPreset } from '@/lib/storefront-theme/presets';
import { legacyNameForPreset } from '@/components/onboarding/lib/theme-mapping';
import { publishDraft, saveDraft } from '@/lib/storefront-theme/db';
import { defaultSections } from '@/lib/storefront-theme/sections';

export type ThemeTarget = 'storefront_themes' | 'legacy_theme_name';

export { legacyNameForPreset };

/**
 * Whether the theme-engine table has landed in this database.
 *
 * @returns True when `storefront_themes` exists
 */
export async function tableExists(): Promise<boolean> {
  try {
    const result = await db.query<{ present: string | null }>(
      "SELECT to_regclass('public.storefront_themes')::text AS present"
    );
    return Boolean(result.rows[0]?.present);
  } catch {
    return false;
  }
}

/**
 * Save the merchant's chosen look as their draft theme.
 *
 * The draft carries the preset's full theme *and* the shipped default section
 * list — a theme with an empty `sections` array renders a blank storefront,
 * which would make "View my store" a broken promise.
 *
 * @param storeId - Owning store
 * @param presetId - Chosen preset
 * @returns Where the choice ended up
 */
export async function persistTheme(storeId: string, presetId: string): Promise<ThemeTarget> {
  const preset = getPreset(presetId);
  if (!preset) throw new Error(`Unknown preset: ${presetId}`);

  if (await tableExists()) {
    try {
      await saveDraft(storeId, preset.theme, defaultSections());
      return 'storefront_themes';
    } catch (error) {
      console.warn('[onboarding/theme] draft save failed, falling back to legacy:', error);
    }
  }

  await db.query('UPDATE stores SET theme_name = $2, updated_at = NOW() WHERE id = $1', [
    storeId,
    legacyNameForPreset(presetId),
  ]);
  return 'legacy_theme_name';
}

/**
 * Promote the draft to published when the merchant hits "Publish my store".
 *
 * Best-effort: a store that publishes without a theme row still renders on the
 * engine's own defaults, so a failure here must not block the launch.
 *
 * @param storeId - Owning store
 * @returns Whether a theme was published
 */
export async function publishTheme(storeId: string): Promise<boolean> {
  if (!(await tableExists())) return false;
  try {
    return (await publishDraft(storeId)) !== null;
  } catch (error) {
    console.warn('[onboarding/publish] theme publish failed:', error);
    return false;
  }
}
