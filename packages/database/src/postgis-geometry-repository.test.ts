import { expect, it } from 'vitest';
import { createDatabasePool } from './pool.js';
import { PostgisGeometryRepository } from './postgis-geometry-repository.js';

it('validates geometry before returning measurements', async () => {
  const pool = createDatabasePool(
    'postgresql://unused:unused@example.invalid/unused',
  );
  try {
    await expect(
      new PostgisGeometryRepository(pool).analyzeIntersection({
        property: { type: 'Point', coordinates: [0, 0] },
        event: { type: 'Point', coordinates: [0, 0] },
      }),
    ).rejects.toThrow();
  } finally {
    await pool.end();
  }
});