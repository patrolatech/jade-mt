import { afterAll, expect, it } from 'vitest';
import type { Geometry } from '@jade/schemas';
import { createDatabasePool } from './pool.js';
import { PostgisGeometryRepository } from './postgis-geometry-repository.js';

const pool = createDatabasePool(
  process.env.DATABASE_URL ?? 'postgresql://jade:jade_dev@127.0.0.1:5432/jade',
);
const repository = new PostgisGeometryRepository(pool);
afterAll(async () => pool.end());

const property: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-55.6, -12],
      [-55.4, -12],
      [-55.4, -11.8],
      [-55.6, -11.8],
      [-55.6, -12],
    ],
  ],
};
const invalid: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-55.6, -12],
      [-55.4, -11.8],
      [-55.6, -11.8],
      [-55.4, -12],
      [-55.6, -12],
    ],
  ],
};

it('accepts real pg booleans and measures a valid polygon', async () => {
  await expect(repository.validateProperty(property)).resolves.toBeUndefined();
  const analysis = await repository.analyzeIntersection({
    property,
    event: property,
  });
  expect(analysis.intersectionExists).toBe(true);
  expect(analysis.intersectionAreaM2).toBeGreaterThan(400_000_000);
  expect(analysis.intersectionAreaM2).toBeLessThan(500_000_000);
  expect(analysis.intersectionPercentage).toBeCloseTo(100, 1);
});

it('identifies whether the invalid geometry belongs to the property or to the event', async () => {
  await expect(repository.validateProperty(invalid)).rejects.toMatchObject({
    name: 'InvalidGeometryError',
    target: 'property',
    reason: expect.stringContaining('Self-intersection'),
  });
  await expect(
    repository.analyzeIntersection({ property, event: invalid }),
  ).rejects.toMatchObject({
    name: 'InvalidGeometryError',
    target: 'event',
    reason: expect.stringContaining('Self-intersection'),
  });
});

it('rejects empty geometries before attempting an intersection', async () => {
  await expect(
    repository.validateProperty({ type: 'MultiPolygon', coordinates: [] }),
  ).rejects.toMatchObject({ target: 'property' });
});

it('respects holes when calculating intersection with a MultiPolygon', async () => {
  const withHole: Geometry = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [-55.6, -12],
          [-55.4, -12],
          [-55.4, -11.8],
          [-55.6, -11.8],
          [-55.6, -12],
        ],
        [
          [-55.55, -11.95],
          [-55.45, -11.95],
          [-55.45, -11.85],
          [-55.55, -11.85],
          [-55.55, -11.95],
        ],
      ],
    ],
  };
  const insideHole: Geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [-55.53, -11.93],
        [-55.47, -11.93],
        [-55.47, -11.87],
        [-55.53, -11.87],
        [-55.53, -11.93],
      ],
    ],
  };
  await expect(
    repository.analyzeIntersection({ property: withHole, event: insideHole }),
  ).resolves.toEqual({
    intersectionExists: false,
    intersectionAreaM2: 0,
    intersectionPercentage: 0,
  });
});

const rectangle = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Geometry => ({
  type: 'Polygon',
  coordinates: [
    [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
      [x1, y1],
    ],
  ],
});

it.each([
  ['edge', rectangle(-55.4, -12, -55.2, -11.8)],
  ['vertex', rectangle(-55.4, -11.8, -55.2, -11.6)],
  ['disjoint', rectangle(-55, -12, -54.8, -11.8)],
])('does not count %s contact as affected area', async (_name, event) => {
  expect(
    await repository.analyzeIntersection({
      property,
      event: event as Geometry,
    }),
  ).toEqual({
    intersectionExists: false,
    intersectionAreaM2: 0,
    intersectionPercentage: 0,
  });
});

it('rejects collinear zero-area polygons and leaves the original geometry unchanged', async () => {
  const zero: Geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [-55.6, -12],
        [-55.5, -12],
        [-55.4, -12],
        [-55.6, -12],
      ],
    ],
  };
  const original = JSON.stringify(zero);
  await expect(repository.validateProperty(zero)).rejects.toMatchObject({
    name: 'InvalidGeometryError',
  });
  expect(JSON.stringify(zero)).toBe(original);
});

it('measures a half overlap against an independent projected reference', async () => {
  const analysis = await repository.analyzeIntersection({
    property,
    event: rectangle(-55.5, -12, -55.3, -11.8),
  });
  const knownIntersection = rectangle(-55.5, -12, -55.4, -11.8);
  const reference = await pool.query<{ area: number }>(
    'SELECT ST_Area(ST_Transform(ST_GeomFromGeoJSON($1), 5880)) AS area',
    [JSON.stringify(knownIntersection)],
  );
  expect(analysis.intersectionExists).toBe(true);
  expect(analysis.intersectionPercentage).toBeCloseTo(50, 2);
  expect(
    Math.abs(analysis.intersectionAreaM2 - reference.rows[0]!.area) /
      reference.rows[0]!.area,
  ).toBeLessThan(0.002);
});

it('demonstrates overlap double counting rather than reporting a union implicitly', async () => {
  const first = await repository.analyzeIntersection({
    property,
    event: property,
  });
  const second = await repository.analyzeIntersection({
    property,
    event: property,
  });
  expect(
    first.intersectionPercentage + second.intersectionPercentage,
  ).toBeCloseTo(200, 5);
});

it('evaluates ST_MakeValid only in research, without repairing repository inputs', async () => {
  const { rows } = await pool.query<{
    original_valid: boolean;
    repaired_valid: boolean;
    repaired_type: string;
  }>(
    `WITH sample AS (SELECT ST_GeomFromGeoJSON($1) AS geom)
     SELECT ST_IsValid(geom) AS original_valid, ST_IsValid(ST_MakeValid(geom)) AS repaired_valid,
     GeometryType(ST_MakeValid(geom)) AS repaired_type FROM sample`,
    [JSON.stringify(invalid)],
  );
  expect(rows[0]).toEqual({
    original_valid: false,
    repaired_valid: true,
    repaired_type: 'MULTIPOLYGON',
  });
  await expect(repository.validateProperty(invalid)).rejects.toMatchObject({
    name: 'InvalidGeometryError',
  });
});

it('exercises source CRS transformation without inferring a datum from coordinate values', async () => {
  const { rows } = await pool.query<{ srid: number; area: number }>(
    `SELECT ST_SRID(transformed) AS srid, ST_Area(transformed::geography) AS area
     FROM (SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4674), 4326) AS transformed) AS sample`,
    [JSON.stringify(property)],
  );
  expect(rows[0]!.srid).toBe(4326);
  expect(rows[0]!.area).toBeGreaterThan(400_000_000);
});
