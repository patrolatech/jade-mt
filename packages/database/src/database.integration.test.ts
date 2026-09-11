import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createDatabasePool, verifyDatabase } from './pool.js';

const pool = createDatabasePool(
  process.env.DATABASE_URL ?? 'postgresql://jade:jade_dev@127.0.0.1:5432/jade',
);
afterAll(async () => pool.end());

it('connects to PostGIS and parses a synthetic polygon without choosing a processing CRS', async () => {
  await verifyDatabase(pool);
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  };
  const { rows } = await pool.query<{ valid: boolean }>(
    'SELECT ST_IsValid(ST_GeomFromGeoJSON($1::text)) AS valid',
    [JSON.stringify(geometry)],
  );
  expect(rows[0]?.valid).toBe(true);
});

it('has the migrated minimal tables and enforces result status and source ownership', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = randomUUID();
    await client.query(
      'INSERT INTO environmental_validations(id, input) VALUES ($1, $2)',
      [id, { synthetic: true }],
    );
    await client.query(
      'INSERT INTO environmental_sources(validation_id, provider, dataset, retrieved_at, payload_hash) VALUES ($1, $2, $3, now(), $4)',
      [id, 'synthetic', 'fixture', 'a'.repeat(64)],
    );
    const { rows } = await client.query<{ count: string }>(
      'SELECT count(*) FROM environmental_sources WHERE validation_id = $1',
      [id],
    );
    expect(rows[0]?.count).toBe('1');
    await client.query('SAVEPOINT invalid_status');
    await expect(
      client.query(
        'UPDATE environmental_validations SET status = $1 WHERE id = $2',
        ['APPROVED', id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await client.query('ROLLBACK TO SAVEPOINT invalid_status');
    await expect(
      client.query(
        'INSERT INTO environmental_sources(validation_id, provider, dataset, retrieved_at, payload_hash) VALUES ($1, $2, $3, now(), $4)',
        [randomUUID(), 'synthetic', 'fixture', 'a'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
