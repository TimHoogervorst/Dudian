import { readFile } from 'node:fs/promises';
import { Pool, type PoolClient } from 'pg';

export function database() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString && !process.env.PGHOST) throw Error('Set DATABASE_URL or PGHOST to the Dudian PostgreSQL database.');
  return new Pool({ connectionString });
}

export async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function initializeDatabase(pool: Pool) {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await transaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock(128014, 1)');
    await client.query('CREATE TABLE IF NOT EXISTS dudian_schema_versions (version integer PRIMARY KEY)');
    const version = await client.query('SELECT max(version) AS version FROM dudian_schema_versions');
    if (version.rows[0].version === 1) return;
    if (version.rows[0].version !== null) throw Error('Unsupported Dudian schema version.');
    await client.query(sql);
    await client.query('INSERT INTO dudian_schema_versions VALUES (1)');
  });
}
