import { readdir, readFile } from 'node:fs/promises';
import { createDatabasePool } from './pool.js';

const pool = createDatabasePool(
  process.env.DATABASE_URL ?? 'postgresql://jade:jade_dev@127.0.0.1:5432/jade',
);
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize local/CI startup migrations across concurrent processes.
    await client.query('SELECT pg_advisory_xact_lock(745013)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const directory = new URL('../migrations/', import.meta.url);
    const files = (await readdir(directory))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const name of files) {
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [name],
      );
      if (applied.rowCount) continue;
      await client.query(await readFile(new URL(name, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
        name,
      ]);
      console.log(`Applied ${name}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
