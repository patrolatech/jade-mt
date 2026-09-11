import { ResearchNotImplementedError } from '@jade/schemas';
import type { DatabasePool } from './index.js';
import type {
  GeometryRepository,
  GeometryAnalysis,
} from './geometry-repository.js';

export class PostgisGeometryRepository implements GeometryRepository {
  constructor(private readonly pool: DatabasePool) {}

  analyzeIntersection(
    input: Parameters<GeometryRepository['analyzeIntersection']>[0],
  ): Promise<GeometryAnalysis> {
    // TODO(intern-gis): implement sql/intersection-research.sql using this.pool.
    // Decide processing CRS, invalid geometry behavior, precision, percentage
    // denominator, and minimum intersection threshold before reporting measurements.
    void this.pool;
    void input;
    return Promise.reject(
      new ResearchNotImplementedError('PostGIS intersection policy'),
    );
  }
}
