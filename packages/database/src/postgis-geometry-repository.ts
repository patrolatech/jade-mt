import {
  isPolygonGeometry,
  countPositions,
  MAX_INPUT_POSITIONS,
} from '@jade/schemas';
import type { Geometry } from '@jade/schemas';
import type { DatabasePool } from './pool.js';
import { InvalidGeometryError } from './geometry-repository.js';
import type {
  GeometryRepository,
  GeometryAnalysis,
} from './geometry-repository.js';

export class PostgisGeometryRepository implements GeometryRepository {
  constructor(private readonly pool: DatabasePool) {}

  async validateProperty(geometry: Geometry): Promise<void> {
    await this.validateGeometry(this.pool, geometry, 'property');
  }

  private async validateGeometry(
    client: Pick<DatabasePool, 'query'>,
    geometry: Geometry,
    target: 'property' | 'event',
  ): Promise<void> {
    if (!isPolygonGeometry(geometry)) {
      throw new InvalidGeometryError(
        target,
        'Expected a non-empty Polygon or MultiPolygon with closed rings and longitude/latitude coordinates',
      );
    }
    if (
      target === 'property' &&
      countPositions(geometry) > MAX_INPUT_POSITIONS
    ) {
      throw new InvalidGeometryError(
        target,
        `Input exceeds ${MAX_INPUT_POSITIONS} coordinate positions`,
      );
    }
    const { rows } = await client.query<{
      valid: boolean;
      reason: string;
      area_m2: number | null;
    }>(
      `SELECT ST_IsValid(geom) AS valid, ST_IsValidReason(geom) AS reason,
       CASE WHEN ST_IsValid(geom) THEN ST_Area(geom::geography) END AS area_m2
       FROM (SELECT ST_GeomFromGeoJSON($1) AS geom) AS input`,
      [JSON.stringify(geometry)],
    );
    if (rows[0]?.valid !== true) {
      throw new InvalidGeometryError(
        target,
        rows[0]?.reason ?? 'Geometry validation failed',
      );
    }
    if (!Number.isFinite(rows[0].area_m2) || Number(rows[0].area_m2) <= 0) {
      throw new InvalidGeometryError(
        target,
        'Geometry must have a finite positive area',
      );
    }
  }

  async analyzeIntersection(input: {
    property: Geometry;
    event: Geometry;
  }): Promise<GeometryAnalysis> {
    const client = await this.pool.connect();
    try {
      const propertyGeoJson = JSON.stringify(input.property);
      const eventGeoJson = JSON.stringify(input.event);

      await this.validateGeometry(client, input.property, 'property');
      await this.validateGeometry(client, input.event, 'event');

      const intersectionResult = await client.query(
        `
        WITH property_geom AS (
          SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
        ),
        event_geom AS (
          SELECT ST_SetSRID(ST_GeomFromGeoJSON($2), 4326) AS geom
        )
        SELECT
          ST_Area(ST_Intersection(p.geom, e.geom)::geography) AS area_m2,
          ST_Area(p.geom::geography) AS property_area_m2
        FROM property_geom p, event_geom e
        `,
        [propertyGeoJson, eventGeoJson],
      );

      const row = intersectionResult.rows[0];
      const areaM2 = Number(row.area_m2);
      const propertyAreaM2 = Number(row.property_area_m2);
      if (
        !Number.isFinite(areaM2) ||
        areaM2 < 0 ||
        !Number.isFinite(propertyAreaM2) ||
        propertyAreaM2 <= 0
      ) {
        throw new Error('PostGIS returned invalid area measurements');
      }
      const percentage = (areaM2 / propertyAreaM2) * 100;

      return {
        intersectionExists: areaM2 > 0,
        intersectionAreaM2: areaM2,
        intersectionPercentage: Math.min(percentage, 100),
      };
    } finally {
      client.release();
    }
  }
}
