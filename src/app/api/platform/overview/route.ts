/**
 * GET /api/platform/overview
 *
 * The operator's headline numbers for the whole tenancy: merchants, traffic, orders, revenue,
 * catalogue, integration progress and the two funnel ratios, each with the previous equally-sized
 * window beside it so the console can render a delta rather than a bare figure.
 *
 * The handler is deliberately thin. Every statement lives in `src/lib/platform/metrics.ts`, which
 * exists so the SQL can be read, reviewed and tested against a real database without going through
 * HTTP — a metrics route whose queries are inlined can only be verified by calling it.
 *
 * Two things this route does *not* do, both on purpose:
 *
 *   * It does not catch per-query failures and substitute zeros. An empty platform already returns
 *     zeros from SQL; a *failed* query returning zeros would be a confident lie, so a thrown error
 *     becomes a 500 with a generic body.
 *   * It does not trust `?days=`. `resolveWindowDays` clamps it before it reaches a statement.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  platformErrorResponse,
  recordAdminAction,
  requirePlatformAdmin,
} from '@/lib/auth/platform-admin';
import { getPlatformOverview, resolveWindowDays } from '@/lib/platform/metrics';

/**
 * Serve the platform overview.
 *
 * @param request - Incoming request; must carry a platform-admin session as a `Bearer` token or
 *                  the `session` cookie. `?days=<1-365>` selects the window, defaulting to 30.
 * @returns `{ success: true, data: PlatformOverview }`, or 401/403 from the guard, or a generic
 *          500 when a query fails.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin(request);

    const days = resolveWindowDays(request.nextUrl.searchParams.get('days'));
    const data = await getPlatformOverview(days);

    await recordAdminAction(admin.userId, 'view_overview', undefined, { days });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return platformErrorResponse(error, 'overview');
  }
}
