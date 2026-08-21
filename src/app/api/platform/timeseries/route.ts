/**
 * GET /api/platform/timeseries
 *
 * The daily series behind the overview charts: clicks, unique visitors, orders, shipments, GMV in
 * cents and new-store signups, one row per UTC day, oldest first.
 *
 * Every day in the window is present even when nothing happened. Zero-filling is done in SQL
 * (`generate_series` left-joined to each metric) rather than in the browser, because a chart that
 * reconciles a sparse response against its own date axis is a chart that draws a different shape
 * depending on which days were quiet.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  platformErrorResponse,
  recordAdminAction,
  requirePlatformAdmin,
} from '@/lib/auth/platform-admin';
import { getPlatformTimeseries, resolveWindowDays } from '@/lib/platform/metrics';
import { resolveIncludeDemo } from '@/lib/platform/customers';

/**
 * Serve the platform daily series.
 *
 * @param request - Incoming request; must carry a platform-admin session. `?days=<1-365>` selects
 *                  the window, defaulting to 30.
 * @returns `{ success: true, data: { days: PlatformTimeseriesDay[] } }`, or 401/403 from the
 *          guard, or a generic 500 when the query fails.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin(request);

    const days = resolveWindowDays(request.nextUrl.searchParams.get('days'));
    /*
     * Demo stores are left out unless the caller explicitly asks for them. The payload's `scope`
     * says which happened and how many stores were hidden, so the console can state the filter
     * rather than just showing a smaller number — a console that hides rows silently is the same
     * class of dishonesty as rendering a failed fetch as a zero.
     */
    const includeDemo = resolveIncludeDemo(request.nextUrl.searchParams);
    const data = await getPlatformTimeseries(days, new Date(), includeDemo);

    await recordAdminAction(admin.userId, 'view_timeseries', undefined, { days });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return platformErrorResponse(error, 'timeseries');
  }
}
