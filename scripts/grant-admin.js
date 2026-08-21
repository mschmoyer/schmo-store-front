#!/usr/bin/env node

/**
 * Grant or revoke platform-operator access.
 * =========================================
 *
 * `users.is_admin` opens `/platform`, which reads across every tenant on the platform. Nothing in
 * the product sets it — not onboarding, not any route, not the seed. It is set here, deliberately,
 * by somebody holding a database URL.
 *
 * Usage
 * -----
 *   node scripts/grant-admin.js <email>              Grant
 *   node scripts/grant-admin.js <email> --revoke     Revoke
 *   node scripts/grant-admin.js --list               Show current operators
 *
 * Environment
 * -----------
 *   DATABASE_URL   Required. Point it at production (Neon) to grant there:
 *                    DATABASE_URL='postgres://…neon.tech/…?sslmode=require' \
 *                      node scripts/grant-admin.js you@example.com
 *
 * This script is deliberately not wired into `npm run` with a hardcoded email. A grant is a
 * privilege escalation and should read as one in the shell history.
 */

const { Client } = require('pg');

/** Whether the connection string points somewhere that needs TLS. */
function needsSsl(url) {
  return /neon\.tech|amazonaws\.com|sslmode=require/i.test(url || '');
}

/**
 * Apply the change and report what the database actually did.
 *
 * @returns {Promise<number>} Process exit code.
 */
async function main() {
  const args = process.argv.slice(2);
  const list = args.includes('--list');
  const revoke = args.includes('--revoke');
  const email = args.find((a) => !a.startsWith('--'));

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    return 1;
  }
  if (!list && !email) {
    console.error('Usage: node scripts/grant-admin.js <email> [--revoke] | --list');
    return 1;
  }

  const client = new Client({
    connectionString: url,
    ssl: needsSsl(url) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  try {
    // The host is worth printing — granting on the wrong database is the mistake this guards.
    const { host, pathname } = new URL(url.replace(/^postgres(ql)?:/, 'http:'));
    console.log(`Target: ${host}${pathname}\n`);

    if (list) {
      const { rows } = await client.query(
        `SELECT email, first_name, last_name, is_active, last_login
           FROM users WHERE is_admin = TRUE ORDER BY email`
      );
      if (rows.length === 0) {
        console.log('No platform operators.');
      } else {
        console.log(`${rows.length} platform operator(s):`);
        for (const r of rows) {
          const state = r.is_active ? '' : '  (INACTIVE — access denied)';
          const seen = r.last_login ? new Date(r.last_login).toISOString().slice(0, 10) : 'never';
          console.log(`  ${r.email}  ${r.first_name} ${r.last_name}  last login ${seen}${state}`);
        }
      }
      return 0;
    }

    // Case-insensitive: nobody types the capitalisation they signed up with.
    const { rows } = await client.query(
      `UPDATE users SET is_admin = $2, updated_at = CURRENT_TIMESTAMP
        WHERE LOWER(email) = LOWER($1)
        RETURNING email, first_name, last_name, is_admin, is_active`,
      [email, !revoke]
    );

    if (rows.length === 0) {
      console.error(`No user with email ${email}. Nothing changed.`);
      return 1;
    }

    const user = rows[0];
    console.log(
      `${revoke ? 'Revoked' : 'Granted'} platform admin: ${user.email} (${user.first_name} ${user.last_name})`
    );
    if (!revoke && !user.is_active) {
      console.log('Note: this account is inactive, so the flag will not grant access until it is reactivated.');
    }
    return 0;
  } finally {
    await client.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('Failed:', error.message);
    process.exit(1);
  });
