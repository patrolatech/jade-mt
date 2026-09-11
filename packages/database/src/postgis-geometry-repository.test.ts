import { expect, it } from 'vitest';
import { ResearchNotImplementedError } from '@jade/schemas';
import { createDatabasePool } from './pool.js';
import { PostgisGeometryRepository } from './postgis-geometry-repository.js';

it('cannot return measurements before the geospatial policy exists', async () => {
  const pool = createDatabasePool(
    'postgresql://unused:unused@example.invalid/unused',
  );
  try {
    await expect(
      new PostgisGeometryRepository(pool).analyzeIntersection({
        property: { type: 'Point', coordinates: [0, 0] },
        event: { type: 'Point', coordinates: [0, 0] },
      }),
    ).rejects.toThrow(ResearchNotImplementedError);
  } finally {
    await pool.end();
  }
});
