/**
 * Shared authentication for Vercel Cron endpoints.
 *
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` on every scheduled
 * invocation, provided the `CRON_SECRET` environment variable is set on the
 * project. These routes are otherwise publicly addressable, so the bearer check
 * is the only thing standing between the open internet and a full ShipStation
 * resync — it fails closed in every ambiguous case.
 */

import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

/** Result of a cron authorization check. */
export type CronAuthResult =
  | { authorized: true; via: string }
  | { authorized: false; response: NextResponse };

/**
 * Constant-time string comparison that does not leak length through early exit
 * any more than necessary.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns True when the values are byte-identical.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the failure cost is roughly constant.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify that a request came from Vercel Cron (or an operator holding the
 * secret).
 *
 * Accepted credentials, in order:
 *   1. `CRON_SECRET` — set automatically as the bearer by Vercel Cron.
 *   2. `SYNC_AUTH_TOKEN` — legacy operator token, kept so the CLI scripts and
 *      any existing runbook keep working during the migration.
 *
 * @param request - The inbound request.
 * @returns Either `{ authorized: true }` or a ready-to-return error response.
 */
export function verifyCronRequest(request: Request): CronAuthResult {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const legacyToken = process.env.SYNC_AUTH_TOKEN?.trim();

  // No secret configured means the endpoint cannot be protected. Refuse to run
  // rather than defaulting open.
  if (!cronSecret && !legacyToken) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error:
            'Cron endpoint is not configured. Set CRON_SECRET in the Vercel project ' +
            'environment variables (Production and Preview) and redeploy.',
        },
        { status: 503 },
      ),
    };
  }

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (presented) {
    if (cronSecret && safeEqual(presented, cronSecret)) {
      return { authorized: true, via: 'CRON_SECRET' };
    }
    if (legacyToken && safeEqual(presented, legacyToken)) {
      return { authorized: true, via: 'SYNC_AUTH_TOKEN' };
    }
  }

  console.warn('[cron] rejected unauthenticated request');
  return {
    authorized: false,
    response: NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
    ),
  };
}

/**
 * Absolute base URL for this deployment, used when a job has to call back into
 * the app's own HTTP API.
 *
 * @returns An absolute origin with no trailing slash.
 */
export function resolveBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  // Vercel-provided. VERCEL_PROJECT_PRODUCTION_URL is the stable production
  // domain; VERCEL_URL is the per-deployment URL used on previews.
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (process.env.VERCEL_ENV === 'production' && productionHost) {
    return `https://${productionHost}`;
  }

  const deploymentHost = process.env.VERCEL_URL?.trim();
  if (deploymentHost) return `https://${deploymentHost}`;

  return 'http://localhost:3000';
}

/** Non-secret execution context attached to every cron response. */
export interface CronContext {
  environment: string;
  region: string;
  commit: string | null;
}

/**
 * Describe where this invocation ran, for log correlation.
 *
 * @returns Environment, region and git sha. Contains no secrets.
 */
export function cronContext(): CronContext {
  return {
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    region: process.env.VERCEL_REGION ?? 'local',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };
}
