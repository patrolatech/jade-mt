import type { Geometry, GeometryAnalysis } from '@jade/schemas';

export type { GeometryAnalysis };

export interface GeometryRepository {
  validateProperty(geometry: Geometry): Promise<void>;
  analyzeIntersection(input: {
    property: Geometry;
    event: Geometry;
  }): Promise<GeometryAnalysis>;
}

export class InvalidGeometryError extends Error {
  constructor(
    public readonly target: 'property' | 'event',
    public readonly reason: string,
  ) {
    super(`Invalid ${target} geometry: ${reason}`);
    this.name = 'InvalidGeometryError';
  }
}
