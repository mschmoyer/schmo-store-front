#!/usr/bin/env node

/**
 * Manual trigger for the ShipStation background sync.
 *
 * In production this job runs on Vercel Cron (see the `crons` block in
 * vercel.json, which hits `/api/cron/sync` hourly). This script exists so an
 * operator can run the same job on demand. It contains no sync logic of its
 * own — the implementation lives in `src/app/api/cron/_lib/sync-job.ts`.
 *
 * Usage:
 *   npm run sync:background
 *
 * Environment:
 *   CRON_SECRET            Bearer credential the /api/cron/* routes accept.
 *   SYNC_AUTH_TOKEN        Accepted as a fallback credential.
 *   NEXT_PUBLIC_BASE_URL   Target deployment. Defaults to localhost:3000.
 *   CRON_TARGET_URL        Overrides the target for a one-off run.
 */

const { triggerCronJob } = require('./lib/trigger-cron-job');

triggerCronJob({
  path: '/api/cron/sync',
  label: 'shipstation-sync',
});
