// Database connection manager for PostgreSQL.
//
// Supports two drivers behind one identical API:
//
//   * `@neondatabase/serverless` — used when the connection string points at a
//     Neon host (or NEON_DATABASE_URL is set). Its `Pool` is a drop-in
//     replacement for `pg.Pool` but speaks Neon's HTTP/WebSocket protocol,
//     which is what survives serverless cold starts on Vercel.
//   * `pg` — used for plain PostgreSQL (local development, self-hosted).
//
// The driver is *detected* from the resolved connection string exactly once and
// then cached on `globalThis` so that Next.js HMR and warm lambda reuse never
// leak pools.
//
// The exported API surface of this module is load-bearing: ~75 modules import
// from here. Nothing exported below may change shape.

import { Pool as PgPool } from 'pg';
import type { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { DatabaseConfig } from '../types/database';

/** Which underlying driver a pool was built with. */
export type DatabaseDriver = 'neon' | 'pg';

/**
 * Everything needed to build a pool, resolved from the environment once.
 * `connectionString` is never logged or returned to callers.
 */
interface ResolvedConnection {
  driver: DatabaseDriver;
  connectionString: string;
  /** Hostname only — safe to log. */
  host: string;
  /** Database name only — safe to log. */
  database: string;
  ssl: boolean;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  /** Name of the env var the connection string came from — safe to log. */
  source: string;
}

interface CachedPool {
  pool: Pool;
  driver: DatabaseDriver;
  connection: ResolvedConnection;
}

/**
 * Pools are cached on `globalThis` rather than in a module-level variable.
 * Next.js dev re-evaluates modules on every HMR pass and each serverless
 * invocation may reuse a warm module registry; a module-scoped singleton leaks
 * a pool per reload.
 */
interface DatabaseGlobal {
  __rebelshopsDbPool?: CachedPool;
}
const globalForDb = globalThis as unknown as DatabaseGlobal;

/** Hosts that never need TLS. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/** Connection-string env vars, in precedence order. */
const CONNECTION_STRING_VARS = [
  'NEON_DATABASE_URL',
  'DATABASE_URL',
  // Set automatically by the Vercel <-> Neon marketplace integration.
  'POSTGRES_URL',
] as const;

const MISSING_URL_MESSAGE = [
  'Database is not configured: no connection string found.',
  '',
  'Set DATABASE_URL to a PostgreSQL connection string. Examples:',
  '  local  postgresql://postgres:postgres@127.0.0.1:5432/rebelshops',
  '  Neon   postgresql://USER:PASSWORD@ep-xxxx-pooler.us-east-1.aws.neon.tech/rebelshops?sslmode=require',
  '',
  'Locally:  add DATABASE_URL to .env.local (copy .env.example as a starting point).',
  'Vercel:   Project -> Settings -> Environment Variables -> add DATABASE_URL to',
  '          Production, Preview and Development, then redeploy.',
  '',
  `Checked, in order: ${CONNECTION_STRING_VARS.join(', ')}, then DB_HOST/DB_NAME/DB_USER.`,
].join('\n');

/**
 * True when the host is served by Neon. Neon endpoints always live under
 * `neon.tech` (production) or `neon.build` (internal/preview branches).
 */
function isNeonHost(host: string): boolean {
  return /(^|\.)neon\.(tech|build)$/i.test(host);
}

/**
 * Build a connection string from the legacy discrete DB_* variables so that
 * existing local setups keep working.
 */
function connectionStringFromParts(): { url: string; source: string } | null {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;

  if (!host || !database || !user) {
    return null;
  }

  const port = process.env.DB_PORT || '5432';
  const password = process.env.DB_PASSWORD || '';
  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);

  return {
    url: `postgresql://${auth}@${host}:${port}/${database}`,
    source: 'DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD',
  };
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Resolve the connection string, driver, TLS requirement and pool sizing from
 * the environment. Throws an actionable error — not a stack trace from deep
 * inside `pg` — when nothing is configured.
 */
function resolveConnection(): ResolvedConnection {
  let url: string | undefined;
  let source = '';

  for (const name of CONNECTION_STRING_VARS) {
    const value = process.env[name];
    if (value && value.trim()) {
      url = value.trim();
      source = name;
      break;
    }
  }

  if (!url) {
    const parts = connectionStringFromParts();
    if (parts) {
      url = parts.url;
      source = parts.source;
    }
  }

  if (!url) {
    throw new Error(MISSING_URL_MESSAGE);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `Database is not configured: the value of ${source} is not a valid PostgreSQL URL. ` +
        'Expected the form postgresql://user:password@host:port/database',
    );
  }

  const host = parsed.hostname;
  const database = parsed.pathname.replace(/^\//, '') || 'postgres';

  // SSL is a property of *where* we are connecting, not a feature flag. Any
  // host that is not loopback gets TLS, whatever DB_SSL happens to say.
  const ssl = !LOCAL_HOSTS.has(host);

  // Explicit override exists as an escape hatch, but detection comes first.
  const override = process.env.DB_DRIVER?.toLowerCase();
  let driver: DatabaseDriver;
  if (override === 'neon' || override === 'pg') {
    driver = override;
  } else if (isNeonHost(host) || Boolean(process.env.NEON_DATABASE_URL)) {
    driver = 'neon';
  } else {
    driver = 'pg';
  }

  // Neon's pooled endpoint (PgBouncer) fronts the real connection limit, so
  // each lambda only needs a couple of sockets. A large `max` on serverless
  // multiplies by the number of concurrent instances and exhausts the endpoint.
  const defaultMax = driver === 'neon' ? 5 : 20;

  return {
    driver,
    connectionString: url,
    host,
    database,
    ssl,
    max: readPositiveInt('DB_POOL_SIZE', defaultMax),
    idleTimeoutMillis: readPositiveInt('DB_IDLE_TIMEOUT', driver === 'neon' ? 10_000 : 30_000),
    connectionTimeoutMillis: readPositiveInt('DB_CONNECTION_TIMEOUT', 10_000),
    source,
  };
}

let neonConfigured = false;

/**
 * Configure the Neon driver once per process.
 *
 * `poolQueryViaFetch` routes single-statement `pool.query()` calls over plain
 * HTTPS instead of opening a WebSocket, which removes a full round trip from
 * every cold start. Transactions still need a WebSocket, which Node 22+
 * provides globally.
 */
function configureNeonOnce(): void {
  if (neonConfigured) return;
  neonConfigured = true;

  neonConfig.poolQueryViaFetch = true;

  const globalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
  if (typeof globalWebSocket !== 'undefined') {
    neonConfig.webSocketConstructor = globalWebSocket as typeof WebSocket;
  }
}

/**
 * Build a pool for the resolved connection. The Neon pool is API-compatible
 * with `pg.Pool`; the cast keeps every call site typed against `pg` so that no
 * consumer of this module has to know which driver is live.
 */
function createPool(connection: ResolvedConnection): Pool {
  if (connection.driver === 'neon') {
    configureNeonOnce();

    const neonPool = new NeonPool({
      connectionString: connection.connectionString,
      max: connection.max,
      idleTimeoutMillis: connection.idleTimeoutMillis,
      connectionTimeoutMillis: connection.connectionTimeoutMillis,
    });

    // A pool-level error (idle client dropped by PgBouncer) is emitted as an
    // unhandled 'error' event and would otherwise crash the lambda.
    neonPool.on('error', (error: Error) => {
      console.error('[database] idle Neon client error:', error.message);
    });

    return neonPool as unknown as Pool;
  }

  const poolConfig: PoolConfig = {
    connectionString: connection.connectionString,
    ssl: connection.ssl
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : false,
    max: connection.max,
    idleTimeoutMillis: connection.idleTimeoutMillis,
    connectionTimeoutMillis: connection.connectionTimeoutMillis,
  };

  const pgPool = new PgPool(poolConfig);
  pgPool.on('error', (error: Error) => {
    console.error('[database] idle Postgres client error:', error.message);
  });

  return pgPool;
}

/**
 * Get the process-wide connection pool, creating it on first use.
 *
 * The driver is chosen once and cached on `globalThis`; repeated calls are
 * free. Safe to call from module scope, request handlers and scripts alike.
 *
 * @returns A `pg`-compatible pool backed by either Neon or node-postgres.
 */
export function getPool(): Pool {
  const cached = globalForDb.__rebelshopsDbPool;
  if (cached) {
    return cached.pool;
  }

  const connection = resolveConnection();
  const pool = createPool(connection);

  globalForDb.__rebelshopsDbPool = { pool, driver: connection.driver, connection };

  console.log(
    `[database] pool ready (driver=${connection.driver} host=${connection.host} ` +
      `db=${connection.database} ssl=${connection.ssl} max=${connection.max} from=${connection.source})`,
  );

  return pool;
}

/**
 * Non-secret description of the live connection, for health checks and logs.
 *
 * @returns Driver, host, database, TLS state and pool sizing. Never includes
 *          credentials or the connection string.
 */
export function getConnectionInfo(): {
  driver: DatabaseDriver;
  host: string;
  database: string;
  ssl: boolean;
  max: number;
  source: string;
} {
  getPool();
  const { connection } = globalForDb.__rebelshopsDbPool!;
  return {
    driver: connection.driver,
    host: connection.host,
    database: connection.database,
    ssl: connection.ssl,
    max: connection.max,
    source: connection.source,
  };
}

/**
 * Connection pool manager. Kept as a class-based singleton because ~400 call
 * sites use `db.query(...)`.
 */
class DatabaseManager {
  private static instance: DatabaseManager;
  private config: DatabaseConfig | null = null;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize the pool eagerly and verify it can reach the database.
   *
   * @param config - Optional explicit configuration. When supplied it overrides
   *                 the environment-derived connection.
   */
  public async initialize(config?: DatabaseConfig): Promise<void> {
    try {
      if (config) {
        this.config = config;
        this.applyExplicitConfig(config);
      }

      getPool();
      await this.testConnection();
      console.log('Database connection initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database connection:', error);
      throw error;
    }
  }

  /**
   * Replace the cached pool with one built from an explicit config object.
   * Only used by callers that pass a config to `initialize()`.
   */
  private applyExplicitConfig(config: DatabaseConfig): void {
    const existing = globalForDb.__rebelshopsDbPool;
    if (existing) {
      void existing.pool.end().catch(() => undefined);
      globalForDb.__rebelshopsDbPool = undefined;
    }

    const auth = config.password
      ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}`
      : encodeURIComponent(config.username);
    const url = `postgresql://${auth}@${config.host}:${config.port}/${config.database}`;

    const ssl = config.ssl ?? !LOCAL_HOSTS.has(config.host);
    const driver: DatabaseDriver = isNeonHost(config.host) ? 'neon' : 'pg';

    const connection: ResolvedConnection = {
      driver,
      connectionString: url,
      host: config.host,
      database: config.database,
      ssl,
      max: config.poolSize || (driver === 'neon' ? 5 : 20),
      idleTimeoutMillis: config.idleTimeout || 30_000,
      connectionTimeoutMillis: config.connectionTimeout || 10_000,
      source: 'explicit config',
    };

    globalForDb.__rebelshopsDbPool = {
      pool: createPool(connection),
      driver,
      connection,
    };
  }

  /**
   * Verify the pool can execute a trivial statement.
   */
  private async testConnection(): Promise<void> {
    await getPool().query('SELECT 1');
  }

  /**
   * Get the underlying connection pool.
   *
   * @returns The cached `pg`-compatible pool.
   */
  public getPool(): Pool {
    return getPool();
  }

  /**
   * Execute a query with automatic connection management.
   *
   * Uses `pool.query()` rather than checking a client out by hand — on Neon
   * that lets a single statement travel over HTTP instead of a WebSocket.
   *
   * @param text - SQL text, with `$1`-style placeholders.
   * @param params - Bound parameters.
   * @returns The driver's query result.
   */
  public async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    try {
      return await getPool().query<T>(text, params as unknown[]);
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  /**
   * Execute a transaction, rolling back on any error.
   *
   * @param callback - Receives a checked-out client bound to the transaction.
   * @returns Whatever the callback returns.
   */
  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await getPool().connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Transaction error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check out a client for manual connection management.
   *
   * @returns A pooled client. The caller must call `release()`.
   */
  public async getClient(): Promise<PoolClient> {
    return await getPool().connect();
  }

  /**
   * Close the pool and drop the cached instance.
   */
  public async close(): Promise<void> {
    const cached = globalForDb.__rebelshopsDbPool;
    if (cached) {
      await cached.pool.end();
      globalForDb.__rebelshopsDbPool = undefined;
      console.log('Database connection pool closed');
    }
  }

  /**
   * Pool utilisation counters.
   *
   * @returns Socket counts, or `null` when no pool has been created yet.
   */
  public getStats() {
    const cached = globalForDb.__rebelshopsDbPool;
    if (!cached) {
      return null;
    }

    return {
      totalCount: cached.pool.totalCount,
      idleCount: cached.pool.idleCount,
      waitingCount: cached.pool.waitingCount,
      driver: cached.driver,
    };
  }
}

// Export singleton instance
export const db = DatabaseManager.getInstance();

// Initialize database connection (call this in your app startup)
export async function initializeDatabase(config?: DatabaseConfig): Promise<void> {
  await db.initialize(config);
}

// Graceful shutdown
export async function closeDatabase(): Promise<void> {
  await db.close();
}

// Query helper functions
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return await db.query<T>(text, params);
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  return await db.transaction(callback);
}

// Connection health check
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query<{ health: number }>('SELECT 1 as health');
    return Number(result.rows[0]?.health) === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Store-specific query helpers
export async function queryWithStore<T extends Record<string, unknown> = Record<string, unknown>>(
  storeId: string,
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const queryParams = [storeId, ...(params || [])];
  return await query<T>(text, queryParams);
}

// Multi-tenant query builder helper
export function buildStoreQuery(
  baseQuery: string,
  storeId: string,
  additionalParams?: unknown[]
): { query: string; params: unknown[] } {
  // Add store_id condition to WHERE clause
  const hasWhere = baseQuery.toLowerCase().includes('where');
  const connector = hasWhere ? ' AND ' : ' WHERE ';
  const storeCondition = `${connector}store_id = $1`;

  const query = baseQuery + storeCondition;
  const params = [storeId, ...(additionalParams || [])];

  return { query, params };
}

// Error handling utility
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public detail?: string,
    public query?: string
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Query result helpers
export function getFirstRow<T extends Record<string, unknown>>(result: QueryResult<T>): T | null {
  return result.rows[0] || null;
}

export function getAllRows<T extends Record<string, unknown>>(result: QueryResult<T>): T[] {
  return result.rows;
}

export function getRowCount(result: QueryResult): number {
  return result.rowCount || 0;
}

// Pagination helper
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export function buildPaginationQuery(
  baseQuery: string,
  pagination: PaginationParams
): { query: string; countQuery: string } {
  const { page = 1, limit = 20, offset } = pagination;

  const actualOffset = offset !== undefined ? offset : (page - 1) * limit;
  const paginatedQuery = `${baseQuery} LIMIT ${limit} OFFSET ${actualOffset}`;

  // Build count query (remove ORDER BY and LIMIT/OFFSET)
  const countQuery = baseQuery
    .replace(/ORDER BY.*$/i, '')
    .replace(/LIMIT.*$/i, '')
    .replace(/OFFSET.*$/i, '')
    .replace(/SELECT.*?FROM/i, 'SELECT COUNT(*) FROM');

  return { query: paginatedQuery, countQuery };
}

// SQL injection prevention helpers
export function sanitizeInput(input: string): string {
  // Basic SQL injection prevention
  return input.replace(/[';\\]/g, '');
}

export function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Database initialization utility
export async function ensureTablesExist(): Promise<void> {
  try {
    // Check if main tables exist
    const result = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'stores', 'products', 'orders')
    `);

    if (result.rows.length < 4) {
      throw new Error('Required database tables are missing. Please run migrations.');
    }

    console.log('Database tables verified');
  } catch (error) {
    console.error('Database table verification failed:', error);
    throw error;
  }
}

// Performance monitoring
export async function getSlowQueries(limit: number = 10): Promise<Record<string, unknown>[]> {
  try {
    const result = await query(`
      SELECT
        query,
        calls,
        total_time,
        mean_time,
        rows
      FROM pg_stat_statements
      ORDER BY mean_time DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  } catch (error) {
    console.error('Failed to get slow queries:', error);
    return [];
  }
}

// Connection monitoring
export function monitorConnections(): void {
  setInterval(async () => {
    try {
      const stats = db.getStats();
      if (stats) {
        console.log('Database connection stats:', stats);

        // Alert if connection pool is running low
        if (stats.idleCount < 2) {
          console.warn('Database connection pool running low on idle connections');
        }
      }
    } catch (error) {
      console.error('Failed to monitor database connections:', error);
    }
  }, 30000); // Check every 30 seconds
}
