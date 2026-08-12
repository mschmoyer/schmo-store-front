/**
 * Vercel Cron target: ShipStation background sync.
 *
 * Replaces the Heroku Scheduler job that ran `npm run sync:background`.
 * Schedule is declared in `vercel.json` under `crons`.
 *
 * Vercel Cron issues a GET with `Authorization: Bearer ${CRON_SECRET}`.
 * POST is also accepted so operators and the CLI script can trigger a run.
 */

import { NextResponse } from 'next/server';
import { cronContext, verifyCronRequest } from '../_lib/cron-auth';
import { runSyncJob } from '../_lib/sync-job';

// Long-running database + upstream API work: never prerender, never cache.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Execute the sync job behind the cron bearer check.
 *
 * @param request - Inbound cron or operator request.
 * @returns 200 with the run summary, 401 unauthenticated, 500 on failure.
 */
async function handle(request: Request): Promise<NextResponse> {
  const auth = verifyCronRequest(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const context = cronContext();
  const startedAt = Date.now();

  try {
    const summary = await runSyncJob();

    // A store that failed to schedule is a real failure worth surfacing, but
    // zero eligible stores is not — a fresh install with no connected
    // integrations should report success, not alarm the operator every hour.
    return NextResponse.json({
      success: summary.storesFailed === 0,
      job: 'shipstation-sync',
      ...context,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cron:sync] job failed:', message);

    return NextResponse.json(
      {
        success: false,
        job: 'shipstation-sync',
        ...context,
        error: message,
        duration: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
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
