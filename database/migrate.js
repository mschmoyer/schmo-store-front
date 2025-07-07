#!/usr/bin/env node

/**
 * Database Migration Runner
 * Runs SQL migration files against PostgreSQL database
 * 
 * Usage:
 *   node database/migrate.js                    # Run all pending migrations
 *   node database/migrate.js --seed             # Run migrations and seed data
 *   node database/migrate.js --reset            # Reset database and run all migrations
 *   node database/migrate.js --status           # Show migration status
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'schmo_store',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(dbConfig);

// Migration file directories
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SEEDS_DIR = path.join(__dirname, 'seeds');

/**
 * Get all migration files sorted by version
 */
function getMigrationFiles() {
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    return files.map(file => ({
      version: file.split('_')[0],
      filename: file,
      path: path.join(MIGRATIONS_DIR, file)
    }));
  } catch (error) {
    console.error('Error reading migration files:', error.message);
    return [];
  }
}

/**
 * Get applied migrations from database
 */
async function getAppliedMigrations() {
  try {
    const result = await pool.query('SELECT version FROM public.schema_migrations ORDER BY version');
    return result.rows.map(row => row.version);
  } catch (error) {
    // Table might not exist yet
    return [];
  }
}

/**
 * Create schema_migrations table if it doesn't exist
 */
async function ensureMigrationsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        description TEXT
      )
    `);
    console.log('✓ Schema migrations table ready');
  } catch (error) {
    console.error('Error creating migrations table:', error.message);
    throw error;
  }
}

/**
 * Run a single migration file
 */
async function runMigration(migration) {
  const client = await pool.connect();
  
  try {
    console.log(`Running migration: ${migration.filename}`);
    
    const sql = fs.readFileSync(migration.path, 'utf8');
    await client.query(sql);
    
    console.log(`✓ Migration ${migration.filename} completed successfully`);
    return true;
  } catch (error) {
    console.error(`✗ Migration ${migration.filename} failed:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run seed data
 */
async function runSeedData() {
  const seedFile = path.join(SEEDS_DIR, 'development.sql');
  
  if (!fs.existsSync(seedFile)) {
    console.log('No seed file found, skipping...');
    return;
  }
  
  const client = await pool.connect();
  
  try {
    console.log('Running seed data...');
    
    const sql = fs.readFileSync(seedFile, 'utf8');
    await client.query(sql);
    
    console.log('✓ Seed data loaded successfully');
  } catch (error) {
    console.error('✗ Seed data failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reset database (drop all tables)
 */
async function resetDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Resetting database...');
    
    // Get all tables in public schema
    const result = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename != 'schema_migrations'
    `);
    
    // Drop all tables
    for (const row of result.rows) {
      await client.query(`DROP TABLE IF EXISTS public.${row.tablename} CASCADE`);
      console.log(`Dropped table: ${row.tablename}`);
    }
    
    // Clear migration history
    await client.query('DELETE FROM public.schema_migrations');
    
    console.log('✓ Database reset completed');
  } catch (error) {
    console.error('✗ Database reset failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Show migration status
 */
async function showMigrationStatus() {
  try {
    const migrationFiles = getMigrationFiles();
    const appliedMigrations = await getAppliedMigrations();
    
    console.log('\nMigration Status:');
    console.log('=================');
    
    if (migrationFiles.length === 0) {
      console.log('No migration files found');
      return;
    }
    
    for (const migration of migrationFiles) {
      const status = appliedMigrations.includes(migration.version) ? '✓ Applied' : '✗ Pending';
      console.log(`${status}   ${migration.filename}`);
    }
    
    const pendingCount = migrationFiles.filter(m => !appliedMigrations.includes(m.version)).length;
    console.log(`\nTotal: ${migrationFiles.length} migrations, ${pendingCount} pending`);
  } catch (error) {
    console.error('Error showing migration status:', error.message);
  }
}

/**
 * Run all pending migrations
 */
async function runMigrations() {
  try {
    await ensureMigrationsTable();
    
    const migrationFiles = getMigrationFiles();
    const appliedMigrations = await getAppliedMigrations();
    
    const pendingMigrations = migrationFiles.filter(
      migration => !appliedMigrations.includes(migration.version)
    );
    
    if (pendingMigrations.length === 0) {
      console.log('✓ All migrations are up to date');
      return;
    }
    
    console.log(`Found ${pendingMigrations.length} pending migration(s)`);
    
    for (const migration of pendingMigrations) {
      await runMigration(migration);
    }
    
    console.log(`\n✓ Successfully ran ${pendingMigrations.length} migration(s)`);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

/**
 * Test database connection
 */
async function testConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✓ Database connection successful');
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    console.error('Please check your database configuration:');
    console.error(`  Host: ${dbConfig.host}`);
    console.error(`  Port: ${dbConfig.port}`);
    console.error(`  Database: ${dbConfig.database}`);
    console.error(`  User: ${dbConfig.user}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  console.log('Schmo Store Database Migration Tool');
  console.log('===================================');
  
  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    process.exit(1);
  }
  
  try {
    if (args.includes('--status')) {
      await showMigrationStatus();
    } else if (args.includes('--reset')) {
      await resetDatabase();
      await runMigrations();
      if (args.includes('--seed')) {
        await runSeedData();
      }
    } else {
      await runMigrations();
      if (args.includes('--seed')) {
        await runSeedData();
      }
    }
  } catch (error) {
    console.error('Operation failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error.message);
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  runMigrations,
  runSeedData,
  resetDatabase,
  showMigrationStatus,
  testConnection
};