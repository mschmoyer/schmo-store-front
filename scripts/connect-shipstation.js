#!/usr/bin/env node
/**
 * Attach a real ShipStation API key to a local store.
 *
 * The app never reads a merchant's key from the environment — every sync,
 * order push and webhook path calls `getIntegration(storeId)`, which reads the
 * encrypted key out of `store_integrations`. So a key sitting in `.env.local`
 * connects nothing on its own; something has to write the row. In production
 * that something is the merchant, through onboarding step 3 or the admin
 * integrations page. Locally, clicking through onboarding to test a sync is
 * five minutes of typing, and Playwright cannot do it without a real key
 * either. This script is the headless equivalent of that click.
 *
 *   SHIPSTATION_API_KEY=... node scripts/connect-shipstation.js
 *   node scripts/connect-shipstation.js --store artisan-craft --key ss_live_...
 *   node scripts/connect-shipstation.js --no-verify      # skip the live probe
 *
 * The key is verified against `GET /v2/warehouses` before anything is written,
 * for the same reason `/api/onboarding/shipstation` does it: storing a key that
 * ShipStation rejects produces a store that looks connected and syncs nothing.
 * `--no-verify` exists for environments whose egress policy blocks
 * api.shipstation.com — the key is still stored, just not proven.
 *
 * Nothing here is printed in full: the key is masked in every line of output,
 * exactly as the admin UI masks it.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Environment — same .env.local fallback as scripts/seed-demo.js
// ---------------------------------------------------------------------------
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { Client } = require('pg');

const WAREHOUSES_URL = 'https://api.shipstation.com/v2/warehouses';

/** Prefix and parameters of the storage format in src/lib/shipstation/crypto.ts. */
const CIPHERTEXT_PREFIX_V1 = 'ssenc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Parses argv into flags.
 *
 * @param {string[]} argv - Raw arguments after the script name.
 * @returns {{store: string|null, key: string|null, verify: boolean, inactive: boolean}} Options.
 */
function parseArgs(argv) {
  const out = { store: null, key: null, verify: true, inactive: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--store') out.store = argv[++i] ?? null;
    else if (arg === '--key') out.key = argv[++i] ?? null;
    else if (arg === '--no-verify') out.verify = false;
    else if (arg === '--inactive') out.inactive = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

/**
 * Decodes SHIPSTATION_ENCRYPTION_KEY, accepting hex, base64 or 32 raw characters.
 *
 * Mirrors `decodeKey` in src/lib/shipstation/crypto.ts; a value this rejects is
 * a value the app would reject too.
 *
 * @param {string} raw - Configured key material.
 * @returns {Buffer|null} A 32-byte key, or null when it cannot be decoded.
 */
function decodeKey(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  const fromBase64 = Buffer.from(trimmed, 'base64');
  if (fromBase64.length === KEY_BYTES) return fromBase64;
  const fromUtf8 = Buffer.from(trimmed, 'utf-8');
  if (fromUtf8.length === KEY_BYTES) return fromUtf8;
  return null;
}

/**
 * Produces a ciphertext in the exact format `decryptSecret` expects.
 *
 * Kept byte-compatible by test: src/lib/shipstation/__tests__/crypto.script-format.test.ts
 * decrypts a value written by this function.
 *
 * @param {string} plaintext - The API key.
 * @param {Buffer} key - 32-byte data encryption key.
 * @returns {string} `ssenc:v1:<iv>.<tag>.<ciphertext>`, all base64.
 */
function encryptSecret(plaintext, key) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    CIPHERTEXT_PREFIX_V1
    + [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.')
  );
}

/**
 * Masks a key for display, matching the admin UI's `••••••••2f9c`.
 *
 * @param {string} key - Plaintext key.
 * @returns {string} Masked form, revealing only the last four characters.
 */
const mask = (key) => `${'•'.repeat(8)}${key.slice(-4)}`;

/**
 * Calls ShipStation with the key to prove it works.
 *
 * @param {string} apiKey - Plaintext V2 API key.
 * @returns {Promise<{ok: true, warehouses: number} | {ok: false, reason: string}>} Outcome.
 */
async function verifyKey(apiKey) {
  let response;
  try {
    response = await fetch(WAREHOUSES_URL, {
      headers: { 'api-key': apiKey },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    return {
      ok: false,
      reason:
        `could not reach ${WAREHOUSES_URL} (${err.message}). If this environment's egress `
        + 'policy blocks shipstation.com, re-run with --no-verify.',
    };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: `ShipStation rejected the key (HTTP ${response.status})` };
  }
  if (!response.ok) {
    return { ok: false, reason: `ShipStation returned HTTP ${response.status}` };
  }

  const body = await response.json().catch(() => ({}));
  const warehouses = Array.isArray(body.warehouses) ? body.warehouses.length : 0;
  return { ok: true, warehouses };
}

/**
 * Finds the target store by slug, name or id.
 *
 * @param {import('pg').Client} client - Connected client.
 * @param {string|null} wanted - Slug, id, or null for the first seeded store.
 * @returns {Promise<{id: string, name: string, slug: string}>} The store.
 */
async function resolveStore(client, wanted) {
  if (wanted) {
    const { rows } = await client.query(
      `SELECT id, store_name AS name, store_slug AS slug FROM stores
        WHERE store_slug = $1 OR store_name = $1 OR id::text = $1
        LIMIT 1`,
      [wanted]
    );
    if (!rows[0]) throw new Error(`No store matches "${wanted}". Seed demo data first: npm run db:seed-demo`);
    return rows[0];
  }

  const { rows } = await client.query(
    'SELECT id, store_name AS name, store_slug AS slug FROM stores ORDER BY created_at ASC LIMIT 1'
  );
  if (!rows[0]) throw new Error('No stores exist. Seed demo data first: npm run db:seed-demo');
  return rows[0];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      'Usage: node scripts/connect-shipstation.js [--store <slug>] [--key <key>] [--no-verify] [--inactive]\n'
    );
    return;
  }

  const apiKey = opts.key || process.env.SHIPSTATION_API_KEY;
  if (!apiKey) {
    throw new Error(
      'No API key. Pass --key, or set SHIPSTATION_API_KEY in .env.local (gitignored).'
    );
  }

  const encryptionKey = decodeKey(process.env.SHIPSTATION_ENCRYPTION_KEY || '');
  if (!encryptionKey) {
    throw new Error(
      'SHIPSTATION_ENCRYPTION_KEY must be set and decode to 32 bytes (hex, base64, or 32 raw\n'
      + 'characters). Generate one with: openssl rand -base64 32\n'
      + '`npm run dev-local -- --setup` writes a local one automatically.'
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set and .env.local does not define it.');
  }

  if (opts.verify) {
    process.stdout.write(`Verifying ${mask(apiKey)} against ShipStation…\n`);
    const verdict = await verifyKey(apiKey);
    if (!verdict.ok) {
      throw new Error(`Key not stored — ${verdict.reason}`);
    }
    process.stdout.write(`  ok — ${verdict.warehouses} warehouse(s) visible\n`);
  } else {
    process.stdout.write('Skipping verification (--no-verify): the key is stored unproven.\n');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const store = await resolveStore(client, opts.store);
    const encrypted = encryptSecret(apiKey, encryptionKey);
    const configuration = JSON.stringify({ apiKeyMasked: mask(apiKey) });
    const isActive = !opts.inactive;

    // `store_integrations` is unique per (store_id, integration_type) in the
    // schema; the manual upsert keeps this working on databases migrated
    // before that constraint existed.
    const existing = await client.query(
      `SELECT id FROM store_integrations
        WHERE store_id = $1 AND integration_type = 'shipstation'
        LIMIT 1`,
      [store.id]
    );

    if (existing.rows[0]) {
      await client.query(
        `UPDATE store_integrations
            SET api_key_encrypted = $1,
                configuration = COALESCE(configuration, '{}'::jsonb) || $2::jsonb,
                is_active = $3,
                credentials_encryption_version = 1,
                updated_at = NOW()
          WHERE id = $4`,
        [encrypted, configuration, isActive, existing.rows[0].id]
      );
      process.stdout.write(`Updated ShipStation credentials for ${store.name} (${store.slug}).\n`);
    } else {
      await client.query(
        `INSERT INTO store_integrations (
           store_id, integration_type, api_key_encrypted, configuration,
           is_active, auto_sync_enabled, auto_sync_interval, webhook_token,
           credentials_encryption_version, created_at, updated_at
         ) VALUES ($1, 'shipstation', $2, $3::jsonb, $4, false, '1hour', $5, 1, NOW(), NOW())`,
        [store.id, encrypted, configuration, isActive, crypto.randomBytes(32).toString('hex')]
      );
      process.stdout.write(`Connected ShipStation to ${store.name} (${store.slug}).\n`);
    }

    process.stdout.write(
      `  store id  ${store.id}\n`
      + `  api key   ${mask(apiKey)}\n`
      + `  active    ${isActive}\n\n`
      + 'Sync it with the admin "Sync" button, or:\n'
      + `  curl -X POST http://localhost:3000/api/admin/sync/products\n`
    );
  } finally {
    await client.end();
  }
}

// Exported so src/lib/shipstation/__tests__/scriptCiphertext.test.ts can prove
// this file's ciphertext is byte-compatible with the app's `decryptSecret`.
module.exports = { encryptSecret, decodeKey, mask, parseArgs };

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`\n${err.message}\n\n`);
    process.exit(1);
  });
}
