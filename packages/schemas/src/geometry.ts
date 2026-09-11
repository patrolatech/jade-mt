import { Type } from '@sinclair/typebox';
import type { Geometry } from 'geojson';

const position = Type.Array(Type.Number(), { minItems: 2 });
const line = Type.Array(position, { minItems: 2 });
const ring = Type.Array(position, { minItems: 4 });
const polygon = Type.Array(ring, { minItems: 1 });

// Structural GeoJSON validation only. Closure, validity, normalization and
// coordinate interpretation belong to the pending GIS methodology.
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

export type { Geometry };
