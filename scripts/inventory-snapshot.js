#!/usr/bin/env node

/**
 * Manual trigger for the daily inventory snapshot job.
 *
 * In production this job runs on Vercel Cron (see the `crons` block in
 * vercel.json, which hits `/api/cron/inventory-snapshot` daily). This script
 * exists so an operator can run the same job on demand or backfill one date.
 * It contains no snapshot logic of its own — the implementation lives in
 * `src/app/api/cron/_lib/inventory-snapshot-job.ts`.
 *
 * Usage:
 *   npm run snapshot:inventory
 *   npm run snapshot:inventory -- 2026-08-01     # backfill a single date
 *
 * Environment:
 *   CRON_SECRET            Bearer credential the /api/cron/* routes accept.
 *   SYNC_AUTH_TOKEN        Accepted as a fallback credential.
 *   NEXT_PUBLIC_BASE_URL   Target deployment. Defaults to localhost:3000.
 *   CRON_TARGET_URL        Overrides the target for a one-off run.
 */

const { triggerCronJob } = require('./lib/trigger-cron-job');

const requestedDate = process.argv.slice(2).find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));

if (process.argv.slice(2).length > 0 && !requestedDate) {
  console.error('Unrecognised argument. Expected an optional date as YYYY-MM-DD.');
  process.exit(1);
}

triggerCronJob({
  path: '/api/cron/inventory-snapshot',
  label: 'inventory-snapshot',
  body: requestedDate ? { date: requestedDate } : undefined,
});
