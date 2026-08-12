/**
 * The thing that drains the job queue.
 *
 * `job_queue` has always had good semantics — priority, bounded batches, exponential backoff, an
 * operator retry hatch — and, until this route existed, no caller at all (audit P1-5). Shipment and
 * delivery emails were written to it and never read again, while the log line said
 * "Queued shipped notification for order X", which reads as success. This endpoint is the missing
 * half.
 *
 * It is called by Vercel Cron, authenticated with `CRON_SECRET` exactly like the existing
 * `/api/cron/*` routes: constant-time bearer comparison, 401 on mismatch, 503 when no secret is
 * configured. It never defaults open.
 *
 * The work budget matters. Vercel kills the invocation at `maxDuration`; if that happens mid-job
 * the row is left in `processing` forever. So the drain stops claiming with time to spare and
 * returns the remainder to the pool for the next tick.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { jobQueueService } from '@/lib/services/jobQueueService';

/** Node runtime: the queue talks to Postgres and uses `crypto`. */
export const runtime = 'nodejs';

/** Never cached, never prerendered. */
export const dynamic = 'force-dynamic';

/**
 * Vercel's function limit for this route is set in `vercel.json`; keep the work budget below it.
 * 60s limit, 50s of work, 10s of headroom for claim/release and response.
 */
const WORK_BUDGET_MS = 50_000;

/** Jobs claimed per invocation. Bounded so one tenant cannot monopolise a tick. */
const BATCH_SIZE = 25;

/**
 * Compare two secrets without leaking length or content through timing.
 *
 * @param a - Presented value.
 * @param b - Expected value.
 * @returns True when equal.
 */
function secretsMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf-8');
  const bufferB = Buffer.from(b, 'utf-8');
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Authorise a drain request.
 *
 * @param request - Incoming request.
 * @returns Null when authorised, or the response to return.
 */
function authorise(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      {
        success: false,
        error: 'CRON_SECRET is not configured; refusing to run the job queue unauthenticated'
      },
      { status: 503 }
    );
  }

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!presented || !secretsMatch(presented, expected)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/**
 * Drain a bounded batch of jobs.
 *
 * @param request - Incoming request.
 * @returns A summary of the pass.
 */
async function drain(request: NextRequest): Promise<NextResponse> {
  const denied = authorise(request);
  if (denied) {
    return denied;
  }

  const started = Date.now();

  try {
    const summary = await jobQueueService.processJobs({
      batchSize: BATCH_SIZE,
      budgetMs: WORK_BUDGET_MS
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          claimed: summary.claimed,
          completed: summary.completed,
          failed: summary.failed,
          budgetExhausted: summary.budgetExhausted,
          durationMs: Date.now() - started
        }
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Job queue drain failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Job queue drain failed'
      },
      { status: 500 }
    );
  }
}

/**
 * Vercel Cron issues GET requests.
 *
 * @param request - Incoming request.
 * @returns A summary of the pass.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return drain(request);
}

/**
 * POST is accepted so an operator can trigger a drain by hand with the same credential.
 *
 * @param request - Incoming request.
 * @returns A summary of the pass.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return drain(request);
}
