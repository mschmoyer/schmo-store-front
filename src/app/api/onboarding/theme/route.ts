/**
 * `POST /api/onboarding/theme` — step 5's first half.
 *
 * Saves the merchant's chosen preset as their *draft* storefront theme. It
 * becomes the live one at `POST /api/onboarding/publish`, which is what makes
 * "This is your real store. Nobody can see it until you publish" true rather
 * than reassuring.
 *
 * The storage decision — theme-engine table vs legacy `stores.theme_name` — is
 * in `../_lib/theme.ts`, with the reasoning.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPreset } from '@/lib/storefront-theme/presets';
import { buildState, originOf, persist, requireOnboarding } from '../_lib/state';
import { persistTheme } from '../_lib/theme';

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
