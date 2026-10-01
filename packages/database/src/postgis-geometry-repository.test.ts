import { expect, it } from 'vitest';
import { createDatabasePool } from './pool.js';
import { PostgisGeometryRepository } from './postgis-geometry-repository.js';
import { InvalidGeometryError } from './geometry-repository.js';

it('rejects unsupported property types before opening a database connection', async () => {
  const pool = createDatabasePool(
    'postgresql://unused:unused@example.invalid/unused',
  );
  try {
    await expect(
      new PostgisGeometryRepository(pool).validateProperty({
        type: 'Point',
        coordinates: [0, 0],
      }),
    ).rejects.toThrow(InvalidGeometryError);
  } finally {
    await pool.end();
  }
});

it('rejects oversized polygons before querying PostGIS', async () => {
  const pool = createDatabasePool(
    'postgresql://unused:unused@example.invalid/unused',
  );
  try {
    await expect(
      new PostgisGeometryRepository(pool).validateProperty({
        type: 'Polygon',
        coordinates: [Array.from({ length: 5_001 }, () => [-55, -12])],
      }),
    ).rejects.toMatchObject({
      name: 'InvalidGeometryError',
      reason: expect.stringContaining('5000'),
    });
  } finally {
    await pool.end();
  }
});
