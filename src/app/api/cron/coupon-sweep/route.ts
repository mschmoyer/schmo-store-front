/**
 * Vercel Cron target: release expired platform-coupon reservations, so a friend who wanders off and
 * comes back later can re-claim the same link. Schedule declared in `vercel.json` under `crons`.
 *
 * Vercel Cron issues a GET with `Authorization: Bearer ${CRON_SECRET}`. POST is also accepted so an
 * operator can trigger a sweep on demand.
 */

import { NextResponse } from 'next/server';
import { cronContext, verifyCronRequest } from '../_lib/cron-auth';
import { runCouponSweepJob } from '../_lib/coupon-sweep-job';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Execute the sweep behind the cron bearer check.
 *
 * @param request - Inbound cron or operator request.
 * @returns 200 with the run summary (released count, honest even at zero), 401 unauthenticated, 500
 *   on failure.
 */
async function handle(request: Request): Promise<NextResponse> {
  const auth = verifyCronRequest(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const context = cronContext();
  const startedAt = Date.now();

  try {
    const summary = await runCouponSweepJob();

    return NextResponse.json({
      success: true,
      job: 'coupon-sweep',
      ...context,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cron:coupon-sweep] job failed:', message);

    return NextResponse.json(
      {
        success: false,
        job: 'coupon-sweep',
        ...context,
        error: message,
        duration: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Vercel Cron entry point.
 *
 * @param request - Inbound request.
 * @returns The job result.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

/**
 * Manual trigger entry point.
 *
 * @param request - Inbound request.
 * @returns The job result.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
