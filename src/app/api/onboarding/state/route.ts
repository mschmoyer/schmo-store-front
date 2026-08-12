/**
 * `GET  /api/onboarding/state` — resume.
 * `POST /api/onboarding/state` — move the cursor (Back, or clicking a completed
 * step in the indicator).
 *
 * The wizard renders from this and nothing else. Closing the tab loses nothing
 * because nothing authoritative was ever in React.
 */

import { NextRequest, NextResponse } from 'next/server';
import { canAccessStep, asStepId } from '@/components/onboarding/lib/steps';
import { ANONYMOUS_STATE } from '@/components/onboarding/lib/types';
import { buildState, originOf, persist, requireOnboarding, toProgress } from '../_lib/state';

/**
 * Return where this merchant got to.
 *
 * A signed-out visitor is not an error — they get the anonymous state, which
 * puts them on step 1. That is the normal path for a brand new merchant.
 *
 * @param request - Incoming request
 * @returns 200 with the onboarding state
 */
export async function GET(request: NextRequest) {
  try {
    const context = await requireOnboarding(request);
    if (!context) {
      return NextResponse.json({ state: ANONYMOUS_STATE });
    }
    return NextResponse.json({ state: await buildState(context, originOf(request)) });
  } catch (error) {
    console.error('[onboarding/state] failed:', error);
    return NextResponse.json(
      { message: 'Something broke on our end. We’ve been notified.' },
      { status: 500 }
    );
  }
}

/**
 * Move to a step the merchant has already reached.
 *
 * Requests to jump *ahead* of the work they have done are refused server-side,
 * so the indicator cannot be used to bypass a step.
 *
 * @param request - JSON body: `{ step }`
 * @returns 200 with the updated state, 401 signed out, 409 when not reachable
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

    const body = (await request.json().catch(() => ({}))) as { step?: string };
    const target = asStepId(body.step, 'account');
    const progress = toProgress(context.row);

    if (!canAccessStep(progress, target)) {
      return NextResponse.json(
        { message: 'Finish this step first.', state: await buildState(context, originOf(request)) },
        { status: 409 }
      );
    }

    const row = await persist(context.row, { goTo: target });
    return NextResponse.json({
      state: await buildState({ session: context.session, row }, originOf(request)),
    });
  } catch (error) {
    console.error('[onboarding/state] navigation failed:', error);
    return NextResponse.json(
      { message: 'Something broke on our end. We’ve been notified.' },
      { status: 500 }
    );
  }
}
