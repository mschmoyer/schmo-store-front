/**
 * `POST /api/onboarding/theme` — step 5's first half.
 *
 * ## The theme-engine dependency, handled honestly
 *
 * `src/lib/storefront-theme/presets.ts` exists and exports six real presets, so
 * the wizard renders real thumbnails from `PRESETS[id].thumbnail` rather than
 * six coloured rectangles.
 *
 * Its persistence layer does not exist yet: the spec (§9) puts the theme in a
 * `storefront_themes` table created by migration `019_storefront_themes.sql`,
 * which is owned by the theme-engine track and has not landed — verified live
 * against the database, `to_regclass('public.storefront_themes')` is null.
 *
 * So this route probes for the table at write time:
 *   - **Table present** → write the preset's full theme into `storefront_themes`
 *     as both draft and published, exactly as the spec describes.
 *   - **Table absent** → fall back to legacy `stores.theme_name`, mapping the
 *     preset back onto the closest legacy name via `LEGACY_THEME_MAP`, and
 *     record the chosen preset id in the onboarding row so nothing is lost.
 *
 * TODO(theme-engine): once `019_storefront_themes.sql` ships, the fallback
 * branch below can be deleted and {@link persistToStorefrontThemes} becomes the
 * only path. Integration point is exactly one function, `persistTheme`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { getPreset, LEGACY_THEME_MAP } from '@/lib/storefront-theme/presets';
import { buildState, originOf, persist, requireOnboarding } from '../_lib/state';

type PersistedTo = 'storefront_themes' | 'legacy_theme_name';

/**
 * Reverse the legacy map: given a preset id, find the legacy `theme_name` that
 * maps onto it, so an old renderer still shows something close to the merchant's
 * choice.
 *
 * @param presetId - Chosen preset
 * @returns A legacy theme name, defaulting to `default`
 */
export function legacyNameForPreset(presetId: string): string {
  const match = Object.entries(LEGACY_THEME_MAP).find(([, value]) => value.preset === presetId);
  return match?.[0] ?? 'default';
}

/**
 * Whether the theme-engine table has landed yet.
 *
 * @returns True when `storefront_themes` exists
 */
async function storefrontThemesExists(): Promise<boolean> {
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
 * Write the preset into the theme-engine table as draft and published.
 *
 * @param storeId - Owning store
 * @param presetId - Chosen preset
 * @returns Whether the write succeeded
 */
async function persistToStorefrontThemes(storeId: string, presetId: string): Promise<boolean> {
  const preset = getPreset(presetId);
  if (!preset) return false;
  try {
    for (const status of ['draft', 'published']) {
      await db.query(
        `INSERT INTO storefront_themes (store_id, theme, sections, status)
         VALUES ($1, $2::jsonb, '[]'::jsonb, $3)
         ON CONFLICT (store_id, status) DO UPDATE
            SET theme = EXCLUDED.theme, updated_at = NOW()`,
        [storeId, JSON.stringify(preset.theme), status]
      );
    }
    return true;
  } catch (error) {
    console.warn('[onboarding/theme] storefront_themes write failed, falling back:', error);
    return false;
  }
}

/**
 * Persist the merchant's chosen look wherever the schema currently supports.
 *
 * @param storeId - Owning store
 * @param presetId - Chosen preset
 * @returns Where the choice ended up
 */
export async function persistTheme(storeId: string, presetId: string): Promise<PersistedTo> {
  if (await storefrontThemesExists()) {
    if (await persistToStorefrontThemes(storeId, presetId)) return 'storefront_themes';
  }
  await db.query('UPDATE stores SET theme_name = $2, updated_at = NOW() WHERE id = $1', [
    storeId,
    legacyNameForPreset(presetId),
  ]);
  return 'legacy_theme_name';
}

/**
 * Save the merchant's starting look.
 *
 * @param request - JSON body: `{ presetId }`
 * @returns 200 with the updated state, 400 on an unknown preset
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireOnboarding(request);
    if (!context) {
      return NextResponse.json(
        { message: 'You’ve been signed out. Sign in to pick up where you left off.' },
        { status: 401 }
      );
    }
    if (!context.row.store_id) {
      return NextResponse.json({ message: 'Name your store first.' }, { status: 409 });
    }

    const body = (await request.json().catch(() => ({}))) as { presetId?: string };
    const presetId = (body.presetId ?? '').trim();
    if (!getPreset(presetId)) {
      return NextResponse.json({ message: 'Pick a look to continue.' }, { status: 400 });
    }

    const persistedTo = await persistTheme(context.row.store_id, presetId);
    const row = await persist(context.row, {
      data: { themePreset: presetId, themePersistedTo: persistedTo },
    });

    return NextResponse.json({
      state: await buildState({ session: context.session, row }, originOf(request)),
    });
  } catch (error) {
    console.error('[onboarding/theme] failed:', error);
    return NextResponse.json(
      { message: 'We couldn’t save that. Check your connection and try again.' },
      { status: 500 }
    );
  }
}
