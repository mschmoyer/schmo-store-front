'use strict';

/**
 * Shared helper for the CLI wrappers around the Vercel Cron endpoints.
 *
 * The job logic itself lives in `src/app/api/cron/_lib/*` and is executed by the
 * route handlers. These scripts exist only so an operator can trigger the same
 * job by hand (or from a non-Vercel scheduler) without a second implementation
 * drifting out of sync with the one production actually runs.
 */

const http = require('http');
const https = require('https');

/**
 * Work out which deployment to talk to.
 *
 * @returns {string} Absolute origin with no trailing slash.
 */
function resolveBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL || process.env.CRON_TARGET_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

/**
 * The bearer credential the cron routes accept.
 *
 * @returns {string|undefined}
 */
function resolveToken() {
  return process.env.CRON_SECRET || process.env.SYNC_AUTH_TOKEN;
}

/**
 * POST to a cron endpoint and print the structured result.
 *
 * Exits the process: 0 when the job reports success, 1 otherwise.
 *
 * @param {object} options
 * @param {string} options.path - Endpoint path, e.g. `/api/cron/sync`.
 * @param {string} options.label - Human-readable job name for log lines.
 * @param {object} [options.body] - Optional JSON body.
 * @param {number} [options.timeoutMs] - Request timeout. Defaults to 10 minutes.
 */
function triggerCronJob({ path, label, body, timeoutMs = 10 * 60 * 1000 }) {
  const baseUrl = resolveBaseUrl();
  const token = resolveToken();

  if (!token) {
    console.error('CRON_SECRET (or SYNC_AUTH_TOKEN) must be set to trigger a cron job.');
    console.error('These are the bearer credentials the /api/cron/* routes accept.');
    process.exit(1);
  }

  const target = new URL(`${baseUrl}${path}`);
  const isHttps = target.protocol === 'https:';
  const requestModule = isHttps ? https : http;
  const payload = body ? JSON.stringify(body) : '';

  console.log(`[${label}] POST ${target.href}`);

  const startedAt = Date.now();
  const request = requestModule.request(
    {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: target.pathname + target.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${token}`,
        'User-Agent': 'rebelshops-cli/1.0',
      },
      timeout: timeoutMs,
    },
    (response) => {
      let raw = '';
      response.on('data', (chunk) => {
        raw += chunk;
      });

      response.on('end', () => {
        const elapsed = Date.now() - startedAt;
        console.log(`[${label}] HTTP ${response.statusCode} in ${elapsed}ms`);

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          console.error(`[${label}] response was not JSON:`);
          console.error(raw.slice(0, 2000));
          process.exit(1);
        }

        console.log(JSON.stringify(parsed, null, 2));

        if (response.statusCode === 401) {
          console.error(`[${label}] unauthorized — CRON_SECRET does not match the deployment.`);
        }

        process.exit(parsed.success === true ? 0 : 1);
      });
    },
  );

  request.on('error', (error) => {
    console.error(`[${label}] request failed after ${Date.now() - startedAt}ms: ${error.message}`);
    if (error.code === 'ECONNREFUSED') {
      console.error('Is the target running? For local runs start the dev server first.');
    }
    process.exit(1);
  });

  request.on('timeout', () => {
    console.error(`[${label}] timed out after ${timeoutMs}ms. The job may still be running.`);
    request.destroy();
    process.exit(1);
  });

  if (payload) request.write(payload);
  request.end();
}

module.exports = { triggerCronJob, resolveBaseUrl, resolveToken };
