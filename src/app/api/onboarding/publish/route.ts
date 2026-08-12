/**
 * `POST /api/onboarding/publish` — step 5's second half, and the end of the run.
 *
 * Flips `stores.is_public` and closes the onboarding record. The store was
 * created private at step 2 (`is_public = false`) precisely so this button
 * means something: until now, "This is your real store. Nobody can see it until
 * you publish" was literally true.
 *
 * `{ draft: true }` is the copy deck's "Save as draft": finish the run, leave
 * the store private. Both paths land on the launch screen — neither dead-ends.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { buildState, originOf, persist, requireOnboarding } from '../_lib/state';

/**
 * Publish (or draft) the merchant's store and finish onboarding.
 *
 * @param request - JSON body: `{ draft?: boolean }`
 * @returns 200 with the final state, including the live store URL
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

    const body = (await request.json().catch(() => ({}))) as { draft?: boolean };
    const publish = body.draft !== true;

    await db.query(
      'UPDATE stores SET is_public = $2, is_active = true, updated_at = NOW() WHERE id = $1',
      [context.row.store_id, publish]
    );

    const row = await persist(context.row, {
      complete: 'style',
      goTo: 'launch',
      finish: true,
      data: { published: publish, publishedAt: new Date().toISOString() },
    });

    const state = await buildState({ session: context.session, row }, originOf(request));

    return NextResponse.json({
      message: publish
        ? `Your store is live at ${state.storeUrl}.`
        : 'Your store is offline. Only you can see it.',
      state,
    });
  } catch (error) {
    console.error('[onboarding/publish] failed:', error);
    return NextResponse.json(
      { message: 'We couldn’t save that. Check your connection and try again.' },
      { status: 500 }
    );
  }
}
