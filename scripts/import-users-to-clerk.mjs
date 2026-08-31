#!/usr/bin/env node
/**
 * One-shot operator tool: import existing users into Clerk, and hand-link a single row.
 *
 * Clerk accepts a bcrypt digest on user creation (`password_digest` + `password_hasher: 'bcrypt'`),
 * so real merchants keep the password they already have and nobody is forced through a reset. The
 * script walks active `users` rows that have no `clerk_user_id` and a real bcrypt hash, creates the
 * Clerk account, and writes the resulting id back.
 *
 * **It refuses to overwrite.** A row that already carries a *different* `clerk_user_id` is left
 * alone and reported. `clerk_user_id` is the only join key between Clerk and this database
 * (docs/plans/clerk-integration.md §3), and re-pointing one at another Clerk account hands that
 * account a merchant's store. This offline script is the single place a link is ever made from an
 * email address, and even here it will not re-link.
 *
 * **Seeded users are skipped by construction.** `seed-demo.js` writes the `'!'` sentinel into
 * `password_hash`, which is not a bcrypt hash, so those rows are never importable. The demo store's
 * owner is linked to a real Clerk account with `--link-owner` instead.
 *
 * Usage:
 *   node scripts/import-users-to-clerk.mjs                       # dry run: report only
 *   node scripts/import-users-to-clerk.mjs --apply               # actually import
 *   node scripts/import-users-to-clerk.mjs --link-owner <email> <clerk_user_id> [--apply]
 *
 * Requires DATABASE_URL, and CLERK_SECRET_KEY for anything that talks to Clerk (a dry run of the
 * import needs neither key nor network beyond the database). Dry run is the default: `--apply` is
 * the only thing that writes, to Clerk or to Postgres.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The rules that decide which rows are touched at all live in scripts/lib/clerk-import-plan.js,
// with no I/O, so they can be unit-tested without a database, a Clerk key or network egress —
// none of which exist in CI. Everything in this file is the I/O around them.
import { classifyUser, planLink } from './lib/clerk-import-plan.js';

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

/** Load `.env.local` into `process.env` for anything not already set, like the other scripts. */
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

/** Loopback hosts get no TLS; everything else does. Matches seed-demo.js and migrate.js. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/**
 * Open a pool against `DATABASE_URL`.
 *
 * @returns {Promise<import('pg').Pool>} The pool.
 */
async function openPool() {
  const { default: pg } = await import('pg');
  let host = '';
  try {
    host = new URL(process.env.DATABASE_URL || '').hostname;
  } catch {
    host = '';
  }
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: host && !LOCAL_HOSTS.has(host) ? { rejectUnauthorized: false } : false,
  });
}

/**
 * Build the Clerk backend client.
 *
 * @returns {Promise<import('@clerk/backend').ClerkClient>} The client.
 */
async function openClerk() {
  const secretKey = (process.env.CLERK_SECRET_KEY || '').trim();
  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY is required to write to Clerk. Run without --apply to dry-run.');
  }
  const { createClerkClient } = await import('@clerk/backend');
  return createClerkClient({ secretKey });
}

/**
 * `--link-owner <email> <clerk_user_id>`: bind one existing row to one Clerk account.
 *
 * @param {import('pg').Pool} pool
 * @param {string} email
 * @param {string} clerkUserId
 * @param {boolean} apply
 * @returns {Promise<number>} Process exit code.
 */
async function linkOwner(pool, email, clerkUserId, apply) {
  const normalized = email.trim().toLowerCase();
  const found = await pool.query(
    'SELECT id, clerk_user_id FROM users WHERE lower(email) = $1',
    [normalized]
  );

  // Without a `lower(email)` unique constraint, legacy data can hold case-variant rows for one
  // address. `rows[0]` is then unordered, so the link would target whichever row Postgres happened
  // to return — the ambiguity an attacker squats to steer a link onto the wrong account. Refuse.
  if (found.rows.length > 1) {
    console.error(
      `refused: ${normalized} -> ${clerkUserId} (${found.rows.length} rows share this address; ` +
        'resolve the duplicates first)'
    );
    return 1;
  }

  const plan = planLink(found.rows[0] ?? null, clerkUserId);

  if (plan.action === 'refuse') {
    console.error(`refused: ${normalized} -> ${clerkUserId} (${plan.reason})`);
    return 1;
  }
  if (plan.action === 'noop') {
    console.log(`already linked: ${normalized} -> ${clerkUserId}`);
    return 0;
  }
  if (!apply) {
    console.log(`would link: ${normalized} -> ${clerkUserId}   (dry run; pass --apply)`);
    return 0;
  }

  await pool.query('UPDATE users SET clerk_user_id = $2 WHERE id = $1', [
    found.rows[0].id,
    clerkUserId,
  ]);
  console.log(`linked: ${normalized} -> ${clerkUserId}`);
  return 0;
}

/**
 * Walk the users table and import everything importable.
 *
 * @param {import('pg').Pool} pool
 * @param {boolean} apply
 * @returns {Promise<number>} Process exit code.
 */
async function importUsers(pool, apply) {
  const result = await pool.query(
    `SELECT id, email, password_hash, clerk_user_id, is_active, first_name, last_name
       FROM users
      ORDER BY created_at ASC`
  );

  const candidates = [];
  const skipped = new Map();
  for (const row of result.rows) {
    const plan = classifyUser(row);
    if (plan.action === 'import') candidates.push(row);
    else skipped.set(plan.reason, (skipped.get(plan.reason) ?? 0) + 1);
  }

  console.log(`${result.rows.length} user row(s); ${candidates.length} importable.`);
  for (const [reason, count] of skipped) console.log(`  skipped ${count}: ${reason}`);

  if (candidates.length === 0) return 0;
  if (!apply) {
    for (const row of candidates) console.log(`  would import: ${row.email}`);
    console.log('Dry run. Pass --apply to write to Clerk and back to the database.');
    return 0;
  }

  const clerk = await openClerk();
  let imported = 0;
  let failed = 0;

  for (const row of candidates) {
    try {
      const created = await clerk.users.createUser({
        emailAddress: [row.email],
        passwordDigest: row.password_hash,
        passwordHasher: 'bcrypt',
        skipPasswordChecks: true,
        firstName: row.first_name || undefined,
        lastName: row.last_name || undefined,
      });

      // Conditional on clerk_user_id still being NULL: if anything linked this row while the Clerk
      // call was in flight, the update writes nothing rather than stealing the row.
      const written = await pool.query(
        'UPDATE users SET clerk_user_id = $2 WHERE id = $1 AND clerk_user_id IS NULL',
        [row.id, created.id]
      );
      if (written.rowCount === 0) {
        console.error(`WARNING: ${row.email} was linked concurrently; Clerk user ${created.id} is now orphaned.`);
        failed += 1;
      } else {
        imported += 1;
        console.log(`  imported: ${row.email} -> ${created.id}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`  FAILED: ${row.email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Done. ${imported} imported, ${failed} failed.`);
  return failed === 0 ? 0 : 1;
}

/**
 * Entry point.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @returns {Promise<number>} Process exit code.
 */
async function main(argv) {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    return 1;
  }

  const apply = argv.includes('--apply');
  const linkIndex = argv.indexOf('--link-owner');

  const pool = await openPool();
  try {
    if (linkIndex !== -1) {
      const email = argv[linkIndex + 1];
      const clerkUserId = argv[linkIndex + 2];
      if (!email || !clerkUserId) {
        console.error('Usage: --link-owner <email> <clerk_user_id> [--apply]');
        return 1;
      }
      return await linkOwner(pool, email, clerkUserId, apply);
    }
    return await importUsers(pool, apply);
  } finally {
    await pool.end();
  }
}

// Only run when executed directly, so the planning functions above can be imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error);
      process.exit(1);
    }
  );
}
