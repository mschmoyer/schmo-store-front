/**
 * Readiness probe.
 *
 * Reports database reachability and latency, applied migration state, the
 * running build, and where it is running. Used by uptime monitoring and as a
 * post-deploy smoke check.
 *
 * Nothing secret is exposed: no connection string, no credentials, no env dump.
 * Only the database *hostname* and name are reported, which are already visible
 * to anyone who can read the Vercel project settings.
 */

import { NextResponse } from 'next/server';
import { db, getConnectionInfo } from '@/lib/database/connection';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Latency above this is reported as `degraded` rather than `ok`. */
const SLOW_QUERY_MS = 1_500;

const BOOTED_AT = Date.now();

/** Overall probe verdict. */
type HealthStatus = 'ok' | 'degraded' | 'error';

interface DatabaseHealth {
  status: HealthStatus;
  latencyMs: number | null;
  driver?: string;
  host?: string;
  database?: string;
  ssl?: boolean;
  pool?: { total: number; idle: number; waiting: number };
  error?: string;
}

interface MigrationHealth {
  status: HealthStatus;
  applied: number | null;
  latest: string | null;
  appliedAt: string | null;
  error?: string;
}

/**
 * Ping the database and collect connection facts.
 *
 * @returns Database sub-report; never throws.
 */
async function checkDatabase(): Promise<DatabaseHealth> {
  const startedAt = Date.now();

  try {
    const result = await db.query<{ ok: number }>('SELECT 1 AS ok');
    const latencyMs = Date.now() - startedAt;

    if (Number(result.rows[0]?.ok) !== 1) {
      return { status: 'error', latencyMs, error: 'Unexpected response from SELECT 1' };
    }

    const info = getConnectionInfo();
    const stats = db.getStats();

    return {
      status: latencyMs > SLOW_QUERY_MS ? 'degraded' : 'ok',
      latencyMs,
      driver: info.driver,
      host: info.host,
      database: info.database,
      ssl: info.ssl,
      pool: stats
        ? { total: stats.totalCount, idle: stats.idleCount, waiting: stats.waitingCount }
        : undefined,
    };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Date.now() - startedAt,
      // The driver's message can name the host but never the password.
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

/**
 * Read the migration tracking table written by `database/migrate.js`.
 *
 * A database with no tracking table is `degraded`, not `error`: the app can
 * still serve traffic, but the deploy pipeline has not run migrations.
 *
 * @returns Migration sub-report; never throws.
 */
async function checkMigrations(): Promise<MigrationHealth> {
  try {
    const present = await db.query<{ present: boolean }>(
      "SELECT to_regclass('public.schema_migration_files') IS NOT NULL AS present",
    );

    if (!present.rows[0]?.present) {
      return {
        status: 'degraded',
        applied: null,
        latest: null,
        appliedAt: null,
        error: 'Migration tracking table missing — run `node database/migrate.js`',
      };
    }

    const result = await db.query<{
      applied: string;
      latest: string | null;
      applied_at: Date | null;
    }>(
      `SELECT COUNT(*)::text AS applied,
              MAX(filename) AS latest,
              MAX(applied_at) AS applied_at
         FROM public.schema_migration_files`,
    );

    const row = result.rows[0];
    return {
      status: 'ok',
      applied: Number(row?.applied ?? 0),
      latest: row?.latest ?? null,
      appliedAt: row?.applied_at ? new Date(row.applied_at).toISOString() : null,
    };
  } catch (error) {
    return {
      status: 'degraded',
      applied: null,
      latest: null,
      appliedAt: null,
      error: error instanceof Error ? error.message : 'Unknown migration check error',
    };
  }
}

/**
 * Combine sub-report verdicts into one.
 *
 * @param statuses - Individual verdicts.
 * @returns The worst verdict present.
 */
function worst(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('error')) return 'error';
  if (statuses.includes('degraded')) return 'degraded';
  return 'ok';
}

/**
 * GET /api/health
 *
 * @returns 200 when `ok` or `degraded`, 503 when the database is unreachable.
 */
export async function GET(): Promise<NextResponse> {
  const [database, migrations] = await Promise.all([checkDatabase(), checkMigrations()]);
  const status = worst([database.status, migrations.status]);

  const body = {
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - BOOTED_AT) / 1000),
    build: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      shortCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    },
    runtime: {
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
      region: process.env.VERCEL_REGION ?? 'local',
      node: process.version,
    },
    database,
    migrations,
  };

  // `degraded` still serves traffic, so it must not fail a load balancer check.
  const httpStatus = database.status === 'error' ? 503 : 200;

  return NextResponse.json(body, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
