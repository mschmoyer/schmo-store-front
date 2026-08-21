#!/usr/bin/env node

/**
 * Mark a store as a demonstration store, or unmark it.
 * ====================================================
 *
 * `stores.is_demo` decides one thing: whether `/platform` counts the store in its platform
 * figures. Demo data is deliberately healthy — full catalogues, clean fulfilment, weeks of tidy
 * traffic — so counting it does not merely add noise, it drags every rate upward and makes the
 * platform look better than it is. The operator console's whole justification is that its numbers
 * can be trusted, so invented merchants stay out of them.
 *
 * Migration 041 backfills the three stores `scripts/seed-demo.js` has always created, by their
 * fixed ids, and the seed now sets the flag itself. This script exists for every other case: a
 * demo store somebody built through the onboarding flow, a sales-demo tenant on a real deployment,
 * or a staging clone where a handful of production stores should stop counting.
 *
 * Nothing about the flag changes how a storefront behaves. It still renders, still takes orders,
 * still syncs. It is invisible to the merchant.
 *
 * Usage
 * -----
 *   node scripts/mark-demo-store.js <slug-or-uuid>            Mark as demo
 *   node scripts/mark-demo-store.js <slug-or-uuid> --real     Unmark
 *   node scripts/mark-demo-store.js --list                    Show every demo store
 *
 * Environment
 * -----------
 *   DATABASE_URL   Required. Point it at production to mark there.
 */

const { Client } = require('pg');

/** Whether the connection string points somewhere that needs TLS. */
function needsSsl(url) {
  return /neon\.tech|amazonaws\.com|sslmode=require/i.test(url || '');
}

/** Whether a string is a UUID, so a slug and an id can share one argument. */
function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Apply the change and report what the database actually did.
 *
 * @returns {Promise<number>} Process exit code.
 */
async function main() {
  const args = process.argv.slice(2);
  const list = args.includes('--list');
  const makeReal = args.includes('--real');
  const target = args.find((a) => !a.startsWith('--'));

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    return 1;
  }
  if (!list && !target) {
    console.error('Usage: node scripts/mark-demo-store.js <slug-or-uuid> [--real] | --list');
    return 1;
  }

  const client = new Client({
    connectionString: url,
    ssl: needsSsl(url) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  try {
    // Printing the host is the guard against doing this to the wrong database.
    const { host, pathname } = new URL(url.replace(/^postgres(ql)?:/, 'http:'));
    console.log(`Target: ${host}${pathname}\n`);

    if (list) {
      const { rows } = await client.query(
        `SELECT store_name, store_slug, is_active, is_public
           FROM stores WHERE is_demo = TRUE ORDER BY store_name`
      );
      if (rows.length === 0) {
        console.log('No demo stores. Every store counts towards platform figures.');
      } else {
        console.log(`${rows.length} demo store(s), excluded from /platform figures:`);
        for (const r of rows) {
          console.log(`  ${r.store_name}  /${r.store_slug}`);
        }
      }
      return 0;
    }

    const { rows } = await client.query(
      `UPDATE stores SET is_demo = $2, updated_at = CURRENT_TIMESTAMP
        WHERE ${isUuid(target) ? 'id = $1::uuid' : 'LOWER(store_slug) = LOWER($1)'}
        RETURNING store_name, store_slug, is_demo`,
      [target, !makeReal]
    );

    if (rows.length === 0) {
      console.error(`No store matching "${target}". Nothing changed.`);
      return 1;
    }

    const store = rows[0];
    console.log(
      store.is_demo
        ? `"${store.store_name}" (/${store.store_slug}) is now a demo store and no longer counts ` +
            'towards platform figures.'
        : `"${store.store_name}" (/${store.store_slug}) is now a real store and counts towards ` +
            'platform figures.'
    );
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
