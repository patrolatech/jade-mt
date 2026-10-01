import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { Geometry, Polygon, MultiPolygon } from 'geojson';

const position = Type.Array(Type.Number(), { minItems: 2 });
const line = Type.Array(position, { minItems: 2 });
const ring = Type.Array(position, { minItems: 4 });
const polygon = Type.Array(ring, { minItems: 1 });

export const GeometrySchema = Type.Recursive(
  (self) =>
    Type.Union([
      Type.Object({ type: Type.Literal('Point'), coordinates: position }),
      Type.Object({
        type: Type.Literal('MultiPoint'),
        coordinates: Type.Array(position),
      }),
      Type.Object({ type: Type.Literal('LineString'), coordinates: line }),
      Type.Object({
        type: Type.Literal('MultiLineString'),
        coordinates: Type.Array(line),
      }),
      Type.Object({ type: Type.Literal('Polygon'), coordinates: polygon }),
      Type.Object({
        type: Type.Literal('MultiPolygon'),
        coordinates: Type.Array(polygon),
      }),
      Type.Object({
        type: Type.Literal('GeometryCollection'),
        geometries: Type.Array(self),
      }),
    ]),
  { $id: 'GeoJsonGeometry' },
);

const longitude = Type.Number({ minimum: -180, maximum: 180 });
const latitude = Type.Number({ minimum: -90, maximum: 90 });
const geographicPosition = Type.Tuple([longitude, latitude]);
export const MAX_INPUT_POSITIONS = 5_000;
const geographicPolygon = Type.Array(
  Type.Array(geographicPosition, { minItems: 4 }),
  { minItems: 1 },
);

export const PolygonGeometrySchema = Type.Union([
  Type.Object(
    {
      type: Type.Literal('Polygon'),
      coordinates: geographicPolygon,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal('MultiPolygon'),
      coordinates: Type.Array(geographicPolygon, { minItems: 1 }),
    },
    { additionalProperties: false },
  ),
]);

export function isPolygonGeometry(
  value: unknown,
): value is Polygon | MultiPolygon {
  if (!Value.Check(PolygonGeometrySchema, value)) return false;
  const polygons =
    value.type === 'Polygon' ? [value.coordinates] : value.coordinates;
  return polygons.every((rings) =>
    rings.every((points) => {
      const first = points[0]!;
      const last = points[points.length - 1]!;
      return (
        first.length === last.length &&
        first.every((coordinate, index) => coordinate === last[index])
      );
    }),
  );
}

export function countPositions(geometry: Polygon | MultiPolygon): number {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.reduce(
    (total, rings) =>
      total + rings.reduce((count, points) => count + points.length, 0),
    0,
  );
}

export type { Geometry };
