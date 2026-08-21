/**
 * GET /api/platform/health
 *
 * The operations screen: which merchants' ShipStation integrations are working, how deep the job
 * queue is, how many paid orders are sitting unshipped, and a triage list of what to do about it.
 *
 * There is no window parameter. "Is it broken *right now*" is not a question a date range improves,
 * and a health page that could be pointed at last March would invite an operator to read a stale
 * answer as a current one.
 *
 * The alert list is capped; the counts beside it are not. That split is deliberate — the numbers
 * stay the complete truth while the list stays a page an operator can actually work through.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  platformErrorResponse,
  recordAdminAction,
  requirePlatformAdmin,
} from '@/lib/auth/platform-admin';
import { getPlatformHealth } from '@/lib/platform/metrics';
import { resolveIncludeDemo } from '@/lib/platform/customers';

/**
 * Serve platform health.
 *
 * @param request - Incoming request; must carry a platform-admin session.
 * @returns `{ success: true, data: PlatformHealth }`, or 401/403 from the guard, or a generic 500
 *          when a query fails.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin(request);

    /*
     * Demo stores are left out unless the caller explicitly asks for them. The payload's `scope`
     * says which happened and how many stores were hidden, so the console can state the filter
     * rather than just showing a smaller number — a console that hides rows silently is the same
     * class of dishonesty as rendering a failed fetch as a zero.
     */
    const includeDemo = resolveIncludeDemo(request.nextUrl.searchParams);
    const data = await getPlatformHealth(includeDemo);

    await recordAdminAction(admin.userId, 'view_health', undefined, {
      failing: data.counts.failing,
      stale: data.counts.stale,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return platformErrorResponse(error, 'health');
  }
}
