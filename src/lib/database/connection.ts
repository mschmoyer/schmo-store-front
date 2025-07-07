// Database connection manager for PostgreSQL
// Handles connection pooling, error handling, and multi-tenant support

import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';
import { DatabaseConfig } from '../types/database';

// Connection pool singleton
class DatabaseManager {
  private static instance: DatabaseManager;
  private pool: Pool | null = null;
  private config: DatabaseConfig | null = null;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize database connection pool
   */
  public async initialize(config?: DatabaseConfig): Promise<void> {
    try {
      // Use provided config or environment variables
      this.config = config || this.getConfigFromEnv();
      
      const poolConfig: PoolConfig = {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
        max: this.config.poolSize || 20,
        idleTimeoutMillis: this.config.idleTimeout || 30000,
        connectionTimeoutMillis: this.config.connectionTimeout || 10000,
      };

      this.pool = new Pool(poolConfig);

      // Test connection
      await this.testConnection();
      console.log('Database connection initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database connection:', error);
      throw error;
    }
  }

  /**
   * Get database configuration from environment variables
   */
  private getConfigFromEnv(): DatabaseConfig {
    // Parse DATABASE_URL if provided, otherwise use individual env vars
    if (process.env.DATABASE_URL) {
      const dbUrl = new URL(process.env.DATABASE_URL);
      return {
        host: dbUrl.hostname,
        port: parseInt(dbUrl.port || '5432'),
        database: dbUrl.pathname.slice(1), // Remove leading slash
        username: dbUrl.username,
        password: dbUrl.password,
        ssl: process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true',
        poolSize: parseInt(process.env.DB_POOL_SIZE || '20'),
        connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
        idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      };
    }

    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'schmo_store_dev',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
      poolSize: parseInt(process.env.DB_POOL_SIZE || '20'),
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    };
  }

  /**
   * Test database connection
   */
  private async testConnection(): Promise<void> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  /**
   * Get database connection pool
   */
  public getPool(): Pool {
    if (!this.pool) {
      // Auto-initialize if not already done
      this.initializeSync();
    }
    return this.pool!;
  }

  /**
   * Synchronous initialization for immediate use
   */
  private initializeSync(): void {
    if (this.pool) return;

    // Use provided config or environment variables
    this.config = this.getConfigFromEnv();
    
    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: this.config.poolSize || 20,
      idleTimeoutMillis: this.config.idleTimeout || 30000,
      connectionTimeoutMillis: this.config.connectionTimeout || 10000,
    };

    this.pool = new Pool(poolConfig);
    console.log('Database connection pool initialized automatically');
  }

  /**
   * Execute a query with automatic connection management
   */
  public async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const pool = this.getPool();
    const client = await pool.connect();
    
    try {
      const result = await client.query<T>(text, params);
      return result;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a transaction with automatic rollback on error
   */
  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get a client for manual connection management
   */
  public async getClient(): Promise<PoolClient> {
    const pool = this.getPool();
    return await pool.connect();
  }

  /**
   * Close all connections
   */
  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('Database connection pool closed');
    }
  }

  /**
   * Get pool statistics
   */
  public getStats() {
    if (!this.pool) {
      return null;
    }

    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
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
    return result.rows[0]?.health === 1;
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