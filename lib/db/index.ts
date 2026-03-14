/**
 * Database connection pool and migration runner. All DB access in the app
 * goes through query/queryOne/execute/transaction, which call ensureDb()
 * to guarantee migrations have run before the first query. The pool size
 * is configurable via DB_POOL_SIZE (default 10).
 */
import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  pool = new Pool({
    connectionString,
    max: parseInt(process.env.DB_POOL_SIZE ?? '10', 10),
  });

  return pool;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  await ensureDb();
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  await ensureDb();
  const result = await getPool().query(sql, params);
  return (result.rows[0] as T) ?? null;
}

export async function execute(
  sql: string,
  params?: unknown[],
): Promise<{ rowCount: number }> {
  await ensureDb();
  const result = await getPool().query(sql, params);
  return { rowCount: result.rowCount ?? 0 };
}

export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  await ensureDb();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<void> {
  const p = getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = await p.query('SELECT version FROM schema_migrations ORDER BY version');
  const appliedVersions = new Set(applied.rows.map((r: { version: string }) => r.version));

  const candidates = [
    path.join(__dirname, 'migrations'),
    path.join(process.cwd(), 'lib', 'db', 'migrations'),
  ];
  const migrationsDir = candidates.find((d) => fs.existsSync(d));
  if (!migrationsDir) return;

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file.replace('.sql', '');
    if (appliedVersions.has(version)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    const client = await p.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      console.log(`Applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

let migrationsPromise: Promise<void> | null = null;

export function ensureDb(): Promise<void> {
  if (!migrationsPromise) {
    migrationsPromise = runMigrations();
  }
  return migrationsPromise;
}
