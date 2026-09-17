import { ResearchNotImplementedError } from '@jade/schemas';
import type { Geometry } from '@jade/schemas';
import type { DatabasePool } from './index.js';
import type {
  GeometryRepository,
  GeometryAnalysis,
} from './geometry-repository.js';

export class PostgisGeometryRepository implements GeometryRepository {
  constructor(private readonly pool: DatabasePool) {}

  async analyzeIntersection(input: {
    property: Geometry;
    event: Geometry;
  }): Promise<GeometryAnalysis> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const propertyGeoJson = JSON.stringify(input.property);
      const eventGeoJson = JSON.stringify(input.event);

      const validateResult = await client.query(
        "SELECT ST_IsValid(ST_GeomFromGeoJSON($1)) AS valid, ST_IsValidReason(ST_GeomFromGeoJSON($1)) AS reason",
        [propertyGeoJson],
      );
      const eventValidResult = await client.query(
        "SELECT ST_IsValid(ST_GeomFromGeoJSON($1)) AS valid, ST_IsValidReason(ST_GeomFromGeoJSON($1)) AS reason",
        [eventGeoJson],
      );

      if (validateResult.rows[0].valid !== 't') {
        throw new ResearchNotImplementedError(
          `Invalid property geometry: ${validateResult.rows[0].reason}`,
        );
      }
      if (eventValidResult.rows[0].valid !== 't') {
        throw new ResearchNotImplementedError(
          `Invalid event geometry: ${eventValidResult.rows[0].reason}`,
        );
      }

      const intersectionResult = await client.query(
        `
        WITH property_geom AS (
          SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
        ),
        event_geom AS (
          SELECT ST_SetSRID(ST_GeomFromGeoJSON($2), 4326) AS geom
        )
        SELECT
          ST_Intersects(p.geom, e.geom) AS intersects,
          ST_Area(ST_Intersection(p.geom::geography, e.geom::geography)) AS area_m2
        FROM property_geom p, event_geom e
        `,
        [propertyGeoJson, eventGeoJson],
      );

      const row = intersectionResult.rows[0];
      const intersects = row.intersects;
      const areaM2 = parseFloat(row.area_m2) || 0;
      const propertyAreaResult = await client.query(
        "SELECT ST_Area(ST_GeomFromGeoJSON($1)::geography) AS area_m2",
        [propertyGeoJson],
      );
      const propertyAreaM2 = parseFloat(propertyAreaResult.rows[0].area_m2) || 0;
      const percentage = propertyAreaM2 > 0 ? (areaM2 / propertyAreaM2) * 100 : 0;

      await client.query('COMMIT');
      return {
        intersectionExists: intersects,
        intersectionAreaM2: areaM2,
        intersectionPercentage: Math.min(percentage, 100),
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}