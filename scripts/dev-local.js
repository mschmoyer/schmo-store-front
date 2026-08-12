#!/usr/bin/env node
/**
 * One command to go from a fresh clone to a running, seeded local stack.
 *
 *   npm run dev-local            # set up whatever is missing, then start the dev server
 *   npm run dev-local -- --fresh # also re-seed demo data even if it is already there
 *   npm run dev-local -- --setup # do the setup, but do not start the server
 *
 * Why this exists: the manual path had five steps and a platform-specific
 * connection string, and the failure mode for getting that string wrong was a
 * raw `28P01` stack trace from pg. Postgres defaults differ per platform —
 * Homebrew on macOS creates a superuser named after your OS account with trust
 * auth and usually no `postgres` role at all, while Docker and most Linux
 * packages do create `postgres`, often with a password. Rather than document
 * that and hope, this probes the candidates and uses whichever connects.
 *
 * Every step is idempotent. Running it twice is safe and fast.
 */

const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.local');
const DB_NAME = 'rebelshops';

const args = process.argv.slice(2);
const FRESH = args.includes('--fresh');
const SETUP_ONLY = args.includes('--setup');

const C = {
  reset: '[0m',
  dim: '[2m',
  bold: '[1m',
  green: '[32m',
  yellow: '[33m',
  red: '[31m',
  cyan: '[36m',
};

/** @param {string} msg */
const step = (msg) => process.stdout.write(`${C.cyan}▸${C.reset} ${msg}\n`);
/** @param {string} msg */
const ok = (msg) => process.stdout.write(`  ${C.green}✓${C.reset} ${msg}\n`);
/** @param {string} msg */
const warn = (msg) => process.stdout.write(`  ${C.yellow}!${C.reset} ${msg}\n`);

/**
 * Reads `.env.local` into a plain object without mutating `process.env`.
 *
 * @returns {Record<string,string>} Parsed key/value pairs, empty when absent.
 */
function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return {};
  /** @type {Record<string,string>} */
  const out = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

/**
 * Tries to open a connection.
 *
 * @param {string} url - Connection string.
 * @param {number} timeoutMs - Connection timeout.
 * @returns {Promise<{ok: true} | {ok: false, code?: string, message: string}>} Outcome.
 */
async function tryConnect(url, timeoutMs = 4000) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: timeoutMs });
  try {
    await client.connect();
    await client.end();
    return { ok: true };
  } catch (err) {
    try { await client.end(); } catch { /* already closed */ }
    return { ok: false, code: err.code, message: err.message };
  }
}

/**
 * Finds a connection string that actually works on this machine.
 *
 * Order matters: an explicit DATABASE_URL always wins, because someone who set
 * one meant it. Otherwise the platform-typical candidates are probed. A
 * `3D000` (database does not exist) counts as a success for the *server*, since
 * it proves the credentials are good and only the database is missing.
 *
 * @returns {Promise<{url: string, needsCreate: boolean} | null>} A usable target.
 */
async function resolveDatabaseUrl() {
  const env = readEnvFile();
  const explicit = process.env.DATABASE_URL || env.DATABASE_URL;
  const user = process.env.USER || process.env.LOGNAME || 'postgres';

  /** @type {string[]} */
  const candidates = explicit
    ? [explicit]
    : [
        `postgresql://${user}@127.0.0.1:5432/${DB_NAME}`,
        `postgresql://postgres:postgres@127.0.0.1:5432/${DB_NAME}`,
        `postgresql://postgres@127.0.0.1:5432/${DB_NAME}`,
      ];

  for (const url of candidates) {
    const result = await tryConnect(url);
    if (result.ok) return { url, needsCreate: false };
    if (result.code === '3D000') return { url, needsCreate: true };
    // Anything else (bad password, refused) means try the next candidate.
  }
  return null;
}

/**
 * Creates the database using the same credentials, via the `postgres` database.
 *
 * @param {string} url - A connection string whose credentials work.
 * @returns {Promise<void>}
 */
async function createDatabase(url) {
  const adminUrl = url.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${DB_NAME}`);
  } finally {
    await client.end();
  }
}

/**
 * Writes `.env.local`, preserving any values already present.
 *
 * @param {string} databaseUrl - The verified connection string.
 * @returns {boolean} Whether the file was created or modified.
 */
function ensureEnvFile(databaseUrl) {
  const existing = readEnvFile();
  const defaults = {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: require('crypto').randomBytes(32).toString('hex'),
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  };

  const missing = Object.entries(defaults).filter(([k]) => !existing[k]);
  if (missing.length === 0) return false;

  const header = fs.existsSync(ENV_FILE)
    ? '\n'
    : '# Local development. Gitignored — safe to keep secrets here.\n'
      + '# See .env.example for every variable the app reads.\n';

  fs.appendFileSync(
    ENV_FILE,
    header + missing.map(([k, v]) => `${k}=${v}`).join('\n') + '\n',
  );
  return true;
}

/**
 * Runs a command, streaming its output only when it fails.
 *
 * @param {string} cmd - Executable.
 * @param {string[]} argv - Arguments.
 * @param {string} databaseUrl - Injected into the child environment.
 * @returns {string} Captured stdout.
 */
function run(cmd, argv, databaseUrl) {
  return execFileSync(cmd, argv, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Counts seeded stores, tolerating a database that has no tables yet.
 *
 * @param {string} url - Connection string.
 * @returns {Promise<number>} Store count, or -1 when the table is absent.
 */
async function countStores(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const res = await client.query('SELECT COUNT(*)::int AS n FROM stores');
    return res.rows[0].n;
  } catch {
    return -1;
  } finally {
    await client.end();
  }
}

/** Prints the post-setup banner with credentials and the URLs worth visiting. */
function banner() {
  const line = '─'.repeat(64);
  process.stdout.write(`
${C.dim}${line}${C.reset}
  ${C.bold}RebelShops is ready${C.reset}

  ${C.bold}Sign in${C.reset}   ${C.green}demo@schmostore.com${C.reset} / ${C.green}rebeldev${C.reset}
  ${C.dim}every seeded user shares that password${C.reset}

  ${C.bold}Marketing${C.reset}       http://localhost:3000
  ${C.bold}Pricing${C.reset}         http://localhost:3000/pricing
  ${C.bold}Admin${C.reset}           http://localhost:3000/admin
  ${C.bold}Customizer${C.reset}      http://localhost:3000/admin/design
  ${C.bold}Onboarding${C.reset}      http://localhost:3000/create-store
  ${C.bold}Design system${C.reset}   http://localhost:3000/dev/design-system

  ${C.bold}Demo storefronts${C.reset} ${C.dim}(three different theme presets)${C.reset}
    Basecamp Audio    http://localhost:3000/store/demo-electronics
    Fernwood Goods    http://localhost:3000/store/artisan-craft
    Ironline Fitness  http://localhost:3000/store/fitness-pro
${C.dim}${line}${C.reset}

`);
}

async function main() {
  process.stdout.write(`\n${C.bold}Setting up RebelShops locally${C.reset}\n\n`);

  step('Finding Postgres');
  const resolved = await resolveDatabaseUrl();
  if (!resolved) {
    const user = process.env.USER || 'your-username';
    process.stderr.write(
      `\n${C.red}Could not connect to Postgres.${C.reset}\n\n`
      + `Is it running?\n`
      + (process.platform === 'darwin'
        ? '  brew services start postgresql@16\n'
        : '  sudo service postgresql start\n')
      + `\nIf it is running under credentials this could not guess, set them in .env.local:\n`
      + `  DATABASE_URL=postgresql://${user}@127.0.0.1:5432/${DB_NAME}\n\n`,
    );
    process.exit(1);
  }
  ok(`connected as ${resolved.url.replace(/:\/\/([^:@/]+)(:[^@]*)?@/, '://$1@')}`);

  if (resolved.needsCreate) {
    step(`Creating database "${DB_NAME}"`);
    await createDatabase(resolved.url);
    ok('created');
  }

  step('Writing .env.local');
  ok(ensureEnvFile(resolved.url) ? 'wrote missing values' : 'already configured');

  step('Applying migrations');
  const migrateOut = run('node', ['database/migrate.js'], resolved.url);
  const applied = (migrateOut.match(/^\s*ok\s/gm) || []).length;
  ok(applied > 0 ? `${applied} migration(s) applied` : 'already up to date');

  const storeCount = await countStores(resolved.url);
  if (FRESH || storeCount <= 0) {
    step('Seeding demo data');
    run('node', ['scripts/seed-demo.js', '--no-dump'], resolved.url);
    const seeded = await countStores(resolved.url);
    ok(`${seeded} stores, with products, orders and blog posts`);
  } else {
    ok(`demo data present (${storeCount} stores) — use --fresh to re-seed`);
  }

  banner();

  if (SETUP_ONLY) {
    process.stdout.write(`${C.dim}Setup only. Start the server with: npm run dev${C.reset}\n\n`);
    return;
  }

  // Hand off to Next. Inherit stdio so Ctrl-C and HMR output behave normally.
  const child = spawn('npx', ['next', 'dev', '--turbopack'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: resolved.url },
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  process.stderr.write(`\n${C.red}Setup failed:${C.reset} ${err.message}\n`);
  if (err.stdout) process.stderr.write(`${err.stdout}\n`);
  if (err.stderr) process.stderr.write(`${err.stderr}\n`);
  process.exit(1);
});
