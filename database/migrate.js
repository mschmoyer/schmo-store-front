#!/usr/bin/env node

/**
 * Database Migration Runner
 * ==========================
 *
 * Applies the SQL files in database/migrations against PostgreSQL (local dev,
 * or Neon over TLS in preview/production).
 *
 * Design notes
 * ------------
 * 1. **Filename-based tracking.** The previous runner keyed applied migrations
 *    on the numeric prefix only. Two files share version `012`
 *    (012_shipstation_warehouses.sql and 012_suppliers_table.sql), so once one
 *    of them recorded `012` the other was silently skipped forever. Tracking is
 *    now keyed on the full filename in `public.schema_migration_files`.
 *
 * 2. **The runner records migrations, not the SQL.** Several files (010, 015,
 *    017) never inserted their own row into the legacy `schema_migrations`
 *    table, so they re-ran on every single deploy — and 017 is not idempotent,
 *    which meant `migrate.js` failed on any database where it had already run.
 *    The runner now writes the tracking row itself, inside the same transaction
 *    as the migration.
 *
 * 3. **Advisory lock.** Two concurrent Vercel builds (or a build racing a
 *    GitHub Action) would otherwise apply the same migration twice. A session
 *    advisory lock serialises them. This requires a *direct* (non-PgBouncer)
 *    connection — see MIGRATION_DATABASE_URL below.
 *
 * 4. **Legacy adoption.** A database that was migrated by the old runner has
 *    rows in `schema_migrations` but no `schema_migration_files` table. On the
 *    first run against such a database the runner baselines it: every file
 *    currently on disk is marked applied *without executing it*, because the
 *    old runner already ran them. Use `--no-adopt` to force a real run, and
 *    `--force <file>` to re-run one specific file.
 *
 * Usage
 * -----
 *   node database/migrate.js                  Apply pending migrations
 *   node database/migrate.js --status         Show status, apply nothing
 *   node database/migrate.js --seed           Apply migrations, then seed data
 *   node database/migrate.js --reset          Drop all tables, re-migrate
 *   node database/migrate.js --baseline       Mark every file applied, run none
 *   node database/migrate.js --force <file>   Re-run one file, ignoring history
 *   node database/migrate.js --dry-run        List what would run
 *   node database/migrate.js --no-adopt       Disable legacy auto-baseline
 *   node database/migrate.js --help
 *
 * Environment
 * -----------
 *   MIGRATION_DATABASE_URL   Preferred. Neon *direct* (unpooled) endpoint.
 *   DATABASE_URL_UNPOOLED    Set by the Vercel/Neon integration. Used next.
 *   POSTGRES_URL_NON_POOLING Also set by the Vercel/Neon integration.
 *   DATABASE_URL             Fallback. Warns if it is a pooled endpoint.
 *   DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD   Legacy discrete fallback.
 *   MIGRATION_LOCK_TIMEOUT_MS  How long to wait for the advisory lock (120000).
 *   ALLOW_POOLED_MIGRATIONS    'true' to proceed on a -pooler host anyway.
 *   DB_SSL_REJECT_UNAUTHORIZED 'false' to accept self-signed certs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SEEDS_DIR = path.join(__dirname, 'seeds');

/** Tracking table owned by this runner. Keyed on filename, not version. */
const TRACKING_TABLE = 'public.schema_migration_files';
/** Table written by the legacy runner and by the migration SQL files. */
const LEGACY_TABLE = 'public.schema_migrations';

/**
 * Constant key for pg_advisory_lock. Any value works as long as every
 * deployment path uses the same one.
 */
const ADVISORY_LOCK_KEY = 4877301199;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * Resolve the connection string migrations should use.
 *
 * Migrations deliberately prefer the direct/unpooled endpoint: session advisory
 * locks and multi-statement DDL transactions do not survive PgBouncer's
 * transaction pooling.
 *
 * @returns {{url: string, source: string, host: string, database: string, ssl: boolean}}
 */
function resolveConnection() {
  const candidates = [
    'MIGRATION_DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
    'DIRECT_DATABASE_URL',
    'DATABASE_URL',
    'POSTGRES_URL',
  ];

  let url;
  let source;

  for (const name of candidates) {
    if (process.env[name] && process.env[name].trim()) {
      url = process.env[name].trim();
      source = name;
      break;
    }
  }

  if (!url && process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER) {
    const port = process.env.DB_PORT || '5432';
    const password = process.env.DB_PASSWORD || '';
    const auth = password
      ? `${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(password)}`
      : encodeURIComponent(process.env.DB_USER);
    url = `postgresql://${auth}@${process.env.DB_HOST}:${port}/${process.env.DB_NAME}`;
    source = 'DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD';
  }

  if (!url) {
    console.error('');
    console.error('No database connection string configured for migrations.');
    console.error('');
    console.error('Set one of the following (first match wins):');
    console.error(`  ${candidates.join('\n  ')}`);
    console.error('');
    console.error('Neon direct endpoint looks like:');
    console.error('  postgresql://USER:PASSWORD@ep-xxxx.us-east-1.aws.neon.tech/rebelshops?sslmode=require');
    console.error('(note: no "-pooler" in the host for migrations)');
    console.error('');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error(`The value of ${source} is not a valid PostgreSQL URL.`);
    process.exit(1);
  }

  const host = parsed.hostname;
  return {
    url,
    source,
    host,
    database: parsed.pathname.replace(/^\//, '') || 'postgres',
    ssl: !LOCAL_HOSTS.has(host),
  };
}

const connection = resolveConnection();

if (/-pooler\./i.test(connection.host)) {
  const message =
    `Refusing to migrate through the pooled endpoint "${connection.host}".\n` +
    'PgBouncer runs in transaction pooling mode, which silently breaks session\n' +
    'advisory locks and long DDL transactions. Use the Neon *direct* endpoint\n' +
    '(same host without "-pooler") via MIGRATION_DATABASE_URL.\n' +
    'Set ALLOW_POOLED_MIGRATIONS=true to override.';
  if (process.env.ALLOW_POOLED_MIGRATIONS === 'true') {
    console.warn(`WARNING: ${message}`);
  } else {
    console.error(message);
    process.exit(1);
  }
}

const pool = new Pool({
  connectionString: connection.url,
  ssl: connection.ssl
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
  // Migrations are a single serial worker; one connection is enough and keeps
  // the advisory lock pinned to a predictable session.
  max: 1,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 10000,
});

// ---------------------------------------------------------------------------
// Migration files
// ---------------------------------------------------------------------------

/**
 * Read every migration file from disk, in lexicographic (= apply) order.
 *
 * @returns {Array<{version: string, filename: string, path: string, checksum: string}>}
 */
function getMigrationFiles() {
  try {
    return fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => {
        const fullPath = path.join(MIGRATIONS_DIR, file);
        const sql = fs.readFileSync(fullPath, 'utf8');
        return {
          version: file.split('_')[0],
          filename: file,
          path: fullPath,
          checksum: crypto.createHash('sha256').update(sql).digest('hex'),
        };
      });
  } catch (error) {
    console.error('Error reading migration files:', error.message);
    return [];
  }
}

/**
 * Warn when the same numeric prefix is reused. This is legal now that tracking
 * is filename-based, but it makes ordering ambiguous to a human reader.
 *
 * @param {Array<{version: string, filename: string}>} files
 */
function warnOnDuplicateVersions(files) {
  const byVersion = new Map();
  for (const file of files) {
    if (!byVersion.has(file.version)) byVersion.set(file.version, []);
    byVersion.get(file.version).push(file.filename);
  }
  for (const [version, names] of byVersion) {
    if (names.length > 1) {
      console.warn(
        `note: version ${version} is used by ${names.length} files (${names.join(', ')}). ` +
          'Tracking is filename-based, so all of them will run.',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Tracking table
// ---------------------------------------------------------------------------

/**
 * Create the filename-keyed tracking table if it does not exist.
 *
 * @param {import('pg').PoolClient} client
 */
async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      filename      TEXT PRIMARY KEY,
      version       TEXT NOT NULL,
      checksum      TEXT NOT NULL,
      applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_ms  INTEGER,
      adopted       BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_schema_migration_files_version
      ON ${TRACKING_TABLE} (version)
  `);
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} regclass
 * @returns {Promise<boolean>} whether the relation exists
 */
async function tableExists(client, regclass) {
  const result = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [regclass]);
  return result.rows[0].present === true;
}

/**
 * @param {import('pg').PoolClient} client
 * @returns {Promise<Map<string, {checksum: string, applied_at: Date, adopted: boolean}>>}
 */
async function getAppliedMigrations(client) {
  const applied = new Map();
  if (!(await tableExists(client, TRACKING_TABLE))) {
    return applied;
  }
  const result = await client.query(
    `SELECT filename, checksum, applied_at, adopted FROM ${TRACKING_TABLE}`,
  );
  for (const row of result.rows) {
    applied.set(row.filename, row);
  }
  return applied;
}

/**
 * Read the version strings the legacy runner recorded.
 *
 * @param {import('pg').PoolClient} client
 * @returns {Promise<Set<string>>}
 */
async function getLegacyVersions(client) {
  if (!(await tableExists(client, LEGACY_TABLE))) {
    return new Set();
  }
  const result = await client.query(`SELECT version FROM ${LEGACY_TABLE}`);
  return new Set(result.rows.map((row) => String(row.version)));
}

/**
 * SQLSTATE codes that mean "the object this migration creates is already
 * there". During legacy adoption these prove the migration's effect is present
 * even though no tracking row exists, so the file can be adopted rather than
 * failing the deploy.
 */
const DUPLICATE_OBJECT_CODES = new Set([
  '42P07', // duplicate_table (also index, sequence, view)
  '42701', // duplicate_column
  '42710', // duplicate_object (trigger, constraint, type, role)
  '42723', // duplicate_function
  '42P06', // duplicate_schema
  '42P04', // duplicate_database
]);

/**
 * Record a migration as applied without executing it.
 *
 * @param {import('pg').PoolClient} client
 * @param {{version: string, filename: string, checksum: string}} file
 */
async function markAdopted(client, file) {
  await client.query(
    `INSERT INTO ${TRACKING_TABLE} (filename, version, checksum, execution_ms, adopted)
     VALUES ($1, $2, $3, 0, TRUE)
     ON CONFLICT (filename) DO NOTHING`,
    [file.filename, file.version, file.checksum],
  );
}

/**
 * Baseline a database that the previous, version-keyed runner already migrated.
 *
 * Only files whose numeric version actually appears in the legacy
 * `schema_migrations` table are adopted — that is positive evidence they ran.
 * Files with no such evidence (including the ones that never recorded
 * themselves, and any genuinely new migration) are left pending so they run
 * for real.
 *
 * @param {import('pg').PoolClient} client
 * @param {Array} files
 * @param {Set<string>} legacyVersions
 * @returns {Promise<number>} how many files were adopted
 */
async function adoptExistingSchema(client, files, legacyVersions) {
  const adoptable = files.filter((file) => legacyVersions.has(file.version));
  if (adoptable.length === 0) {
    return 0;
  }

  console.log('');
  console.log('-'.repeat(72));
  console.log('Baselining a database migrated by the previous version-keyed runner.');
  console.log(`${adoptable.length} file(s) whose version is recorded in ${LEGACY_TABLE}`);
  console.log('are being marked APPLIED without re-running them.');
  console.log('Anything not recorded there is left pending and will run normally.');
  console.log('-'.repeat(72));

  for (const file of adoptable) {
    await markAdopted(client, file);
    console.log(`  adopted  ${file.filename}`);
  }
  console.log('');
  return adoptable.length;
}

// ---------------------------------------------------------------------------
// Advisory lock
// ---------------------------------------------------------------------------

/**
 * Acquire the session advisory lock, retrying until the timeout expires.
 *
 * @param {import('pg').PoolClient} client
 * @returns {Promise<void>}
 */
async function acquireLock(client) {
  const timeoutMs = Number.parseInt(process.env.MIGRATION_LOCK_TIMEOUT_MS || '120000', 10);
  const deadline = Date.now() + timeoutMs;
  let waited = false;

  for (;;) {
    const result = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [
      ADVISORY_LOCK_KEY,
    ]);
    if (result.rows[0].locked) {
      if (waited) console.log('Acquired migration lock.');
      return;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for the migration advisory lock. ` +
          'Another migration run is in progress (concurrent deploy?). ' +
          'Raise MIGRATION_LOCK_TIMEOUT_MS or retry the deploy.',
      );
    }

    if (!waited) {
      console.log('Another migration run holds the lock; waiting...');
      waited = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/**
 * @param {import('pg').PoolClient} client
 */
async function releaseLock(client) {
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
  } catch {
    // Session is going away anyway; the lock dies with it.
  }
}

// ---------------------------------------------------------------------------
// Running migrations
// ---------------------------------------------------------------------------

/**
 * Execute one migration file and record it, atomically.
 *
 * @param {import('pg').PoolClient} client
 * @param {{version: string, filename: string, path: string, checksum: string}} migration
 * @param {boolean} tolerateAlreadyApplied - When true (legacy baseline pass
 *        only), a duplicate-object failure means the migration's effect is
 *        already in the schema, so it is adopted instead of failing the run.
 */
async function runMigration(client, migration, tolerateAlreadyApplied = false) {
  const sql = fs.readFileSync(migration.path, 'utf8');
  const startedAt = Date.now();

  console.log(`  running  ${migration.filename}`);

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      `INSERT INTO ${TRACKING_TABLE} (filename, version, checksum, execution_ms, adopted)
       VALUES ($1, $2, $3, $4, FALSE)
       ON CONFLICT (filename) DO UPDATE
         SET checksum = EXCLUDED.checksum,
             applied_at = NOW(),
             execution_ms = EXCLUDED.execution_ms,
             adopted = FALSE`,
      [migration.filename, migration.version, migration.checksum, Date.now() - startedAt],
    );
    await client.query('COMMIT');
    console.log(`  ok       ${migration.filename} (${Date.now() - startedAt}ms)`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    if (tolerateAlreadyApplied && DUPLICATE_OBJECT_CODES.has(error.code)) {
      await markAdopted(client, migration);
      console.warn(
        `  adopted  ${migration.filename} — already present in this database ` +
          `(${error.code}: ${error.message}). Recorded as applied.`,
      );
      return;
    }

    console.error(`  FAILED   ${migration.filename}: ${error.message}`);
    throw error;
  }
}

/**
 * Apply every migration not yet recorded.
 *
 * @param {{adopt?: boolean, dryRun?: boolean, force?: string[]}} options
 */
async function runMigrations(options = {}) {
  const { adopt = true, dryRun = false, force = [] } = options;
  const client = await pool.connect();

  try {
    await acquireLock(client);

    const files = getMigrationFiles();
    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }
    warnOnDuplicateVersions(files);

    const trackingExisted = await tableExists(client, TRACKING_TABLE);
    // --dry-run must not mutate anything, not even the tracking table.
    if (!dryRun) {
      await ensureTrackingTable(client);
    }

    // First run of this runner against a database the old runner already
    // migrated? Baseline the files it provably applied instead of replaying
    // them, then run the rest in "tolerate already applied" mode.
    let legacyBaseline = false;
    /** Filenames the baseline pass adopted (or, under --dry-run, would adopt). */
    const simulatedAdoptions = new Set();
    if (!trackingExisted && adopt) {
      const legacyVersions = await getLegacyVersions(client);
      if (legacyVersions.size > 0) {
        legacyBaseline = true;
        if (dryRun) {
          for (const file of files) {
            if (legacyVersions.has(file.version)) simulatedAdoptions.add(file.filename);
          }
          console.log(
            `[dry-run] would baseline ${simulatedAdoptions.size} file(s) already recorded in ` +
              `${LEGACY_TABLE}, without running them.`,
          );
        } else {
          await adoptExistingSchema(client, files, legacyVersions);
        }
      }
    }

    const applied = await getAppliedMigrations(client);
    for (const filename of simulatedAdoptions) {
      applied.set(filename, { checksum: null, applied_at: new Date(), adopted: true });
    }

    // Checksum drift: a file changed after it was applied.
    for (const file of files) {
      const record = applied.get(file.filename);
      if (record && !record.adopted && record.checksum !== file.checksum) {
        console.warn(
          `warning: ${file.filename} changed since it was applied ` +
            `(${record.applied_at.toISOString()}). Migrations should be append-only; ` +
            'add a new file instead of editing history.',
        );
      }
    }

    const forced = files.filter((f) => force.includes(f.filename));
    for (const name of force) {
      if (!files.some((f) => f.filename === name)) {
        throw new Error(`--force target not found in ${MIGRATIONS_DIR}: ${name}`);
      }
    }

    const pending = files.filter((f) => !applied.has(f.filename) || force.includes(f.filename));

    if (pending.length === 0) {
      console.log(`Up to date — ${files.length} migration(s) already applied.`);
      return;
    }

    if (dryRun) {
      console.log(`[dry-run] ${pending.length} migration(s) would run:`);
      pending.forEach((m) => console.log(`  would run  ${m.filename}`));
      return;
    }

    console.log(
      `Applying ${pending.length} migration(s)` +
        (forced.length ? ` (${forced.length} forced)` : '') +
        ':',
    );
    for (const migration of pending) {
      await runMigration(client, migration, legacyBaseline && !force.includes(migration.filename));
    }
    console.log(`Done - ${pending.length} migration(s) applied.`);
  } finally {
    await releaseLock(client);
    client.release();
  }
}

/**
 * Mark every migration file on disk as applied without executing any of them.
 *
 * Escape hatch for adopting a database whose history this runner cannot infer.
 * Unlike the automatic legacy baseline, this adopts unconditionally.
 */
async function baseline() {
  const client = await pool.connect();
  try {
    await acquireLock(client);
    await ensureTrackingTable(client);

    const files = getMigrationFiles();
    console.log('');
    console.log('-'.repeat(72));
    console.log(`Explicit --baseline: marking all ${files.length} file(s) APPLIED, running none.`);
    console.log('-'.repeat(72));
    for (const file of files) {
      await markAdopted(client, file);
      console.log(`  adopted  ${file.filename}`);
    }
    console.log('');
  } finally {
    await releaseLock(client);
    client.release();
  }
}

/**
 * Load database/seeds/development.sql, if present.
 */
async function runSeedData() {
  const seedFile = path.join(SEEDS_DIR, 'development.sql');

  if (!fs.existsSync(seedFile)) {
    console.log('No seed file found, skipping.');
    return;
  }

  const client = await pool.connect();
  try {
    console.log('Running seed data...');
    await client.query(fs.readFileSync(seedFile, 'utf8'));
    console.log('Seed data loaded.');
  } catch (error) {
    console.error(`Seed data failed: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Drop every table in the public schema and clear migration history.
 */
async function resetDatabase() {
  if (connection.ssl && process.env.ALLOW_DESTRUCTIVE_RESET !== 'true') {
    throw new Error(
      `Refusing to --reset a remote database (${connection.host}). ` +
        'Set ALLOW_DESTRUCTIVE_RESET=true if you really mean it.',
    );
  }

  const client = await pool.connect();
  try {
    await acquireLock(client);
    console.log('Resetting database...');

    const result = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );

    for (const row of result.rows) {
      const quoted = `"${String(row.tablename).replace(/"/g, '""')}"`;
      await client.query(`DROP TABLE IF EXISTS public.${quoted} CASCADE`);
      console.log(`  dropped  ${row.tablename}`);
    }

    console.log('Database reset complete.');
  } catch (error) {
    console.error(`Database reset failed: ${error.message}`);
    throw error;
  } finally {
    await releaseLock(client);
    client.release();
  }
}

/**
 * Print applied/pending state for every migration file.
 */
async function showMigrationStatus() {
  const client = await pool.connect();
  try {
    const files = getMigrationFiles();
    const applied = await getAppliedMigrations(client);

    console.log('');
    console.log(`Host:     ${connection.host}/${connection.database} (from ${connection.source})`);
    console.log(`Tracking: ${TRACKING_TABLE}`);
    console.log('');

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    let pendingCount = 0;
    for (const file of files) {
      const record = applied.get(file.filename);
      let status;
      if (!record) {
        status = 'PENDING ';
        pendingCount += 1;
      } else if (record.adopted) {
        status = 'adopted ';
      } else {
        status = 'applied ';
      }

      const when = record ? record.applied_at.toISOString().replace('T', ' ').slice(0, 19) : '';
      const drift =
        record && !record.adopted && record.checksum !== file.checksum ? '  [checksum changed]' : '';
      console.log(`  ${status} ${file.filename.padEnd(44)} ${when}${drift}`);
    }

    console.log('');
    console.log(`Total: ${files.length} migration(s), ${pendingCount} pending.`);
  } finally {
    client.release();
  }
}

/**
 * Verify the database is reachable.
 *
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
    return true;
  } catch (error) {
    console.error(`Database connection failed: ${error.message}`);
    console.error(`  host:     ${connection.host}`);
    console.error(`  database: ${connection.database}`);
    console.error(`  ssl:      ${connection.ssl}`);
    console.error(`  from:     ${connection.source}`);
    return false;
  }
}

function printHelp() {
  console.log(`
Database migration runner

  node database/migrate.js                 Apply pending migrations
  node database/migrate.js --status        Show status only
  node database/migrate.js --seed          Migrate, then load seed data
  node database/migrate.js --reset         Drop all tables, then migrate
  node database/migrate.js --baseline      Mark all files applied, run none
  node database/migrate.js --force <file>  Re-run one file (repeatable)
  node database/migrate.js --dry-run       Show what would run
  node database/migrate.js --no-adopt      Do not auto-baseline legacy databases
  node database/migrate.js --help
`);
}

/**
 * CLI entry point.
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const force = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--force') {
      const target = args[i + 1];
      if (!target || target.startsWith('--')) {
        throw new Error('--force requires a migration filename');
      }
      force.push(target);
      i += 1;
    }
  }

  const options = {
    adopt: !args.includes('--no-adopt'),
    dryRun: args.includes('--dry-run'),
    force,
  };

  console.log(`Migrations -> ${connection.host}/${connection.database}`);

  if (!(await testConnection())) {
    process.exit(1);
  }

  if (args.includes('--status')) {
    await showMigrationStatus();
  } else if (args.includes('--baseline')) {
    await baseline();
    await showMigrationStatus();
  } else if (args.includes('--reset')) {
    await resetDatabase();
    await runMigrations({ ...options, adopt: false });
    if (args.includes('--seed')) {
      await runSeedData();
    }
  } else {
    await runMigrations(options);
    if (args.includes('--seed')) {
      await runSeedData();
    }
  }
}

if (require.main === module) {
  main()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('');
      console.error(`Migration run failed: ${error.message}`);
      await pool.end().catch(() => undefined);
      process.exit(1);
    });
}

module.exports = {
  runMigrations,
  runSeedData,
  resetDatabase,
  showMigrationStatus,
  testConnection,
  baseline,
  getMigrationFiles,
  pool,
};
