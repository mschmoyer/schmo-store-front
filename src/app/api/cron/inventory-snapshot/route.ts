/**
 * Vercel Cron target: daily inventory snapshots.
 *
 * Replaces the Heroku Scheduler job that ran `npm run snapshot:inventory`.
 * Schedule is declared in `vercel.json` under `crons`.
 *
 * Vercel Cron issues a GET with `Authorization: Bearer ${CRON_SECRET}`.
 * POST is also accepted so operators and the CLI script can trigger a run, and
 * accepts an optional `{ "date": "YYYY-MM-DD" }` body to backfill one day.
 */

import { NextResponse } from 'next/server';
import { cronContext, verifyCronRequest } from '../_lib/cron-auth';
import { runInventorySnapshotJob } from '../_lib/inventory-snapshot-job';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Parse an optional explicit snapshot date from the request body.
 *
 * @param request - Inbound request.
 * @returns The requested date, or undefined to use today.
 */
async function readRequestedDate(request: Request): Promise<Date | undefined> {
  if (request.method !== 'POST') return undefined;

  try {
    const text = await request.text();
    if (!text) return undefined;

    const body = JSON.parse(text) as { date?: string };
    if (!body.date) return undefined;

    const parsed = new Date(body.date);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  } catch {
    return undefined;
  }
}

/**
 * Execute the snapshot job behind the cron bearer check.
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
    const requestedDate = await readRequestedDate(request);
    const summary = await runInventorySnapshotJob(requestedDate);

    return NextResponse.json({
      success: summary.failedOperations === 0,
      job: 'inventory-snapshot',
      ...context,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cron:inventory-snapshot] job failed:', message);

    return NextResponse.json(
      {
        success: false,
        job: 'inventory-snapshot',
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
