import type { Geometry, GeometryAnalysis } from '@jade/schemas';

export type { GeometryAnalysis };

export interface GeometryRepository {
  analyzeIntersection(input: {
    property: Geometry;
    event: Geometry;
  }): Promise<GeometryAnalysis>;
}
