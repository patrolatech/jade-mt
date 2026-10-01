# Validation input v0.1

| Field                    | Contract                                                  |
| ------------------------ | --------------------------------------------------------- |
| `geometry`               | Non-empty 2D GeoJSON Polygon or MultiPolygon in EPSG:4326 |
| `commodity`              | Non-blank string, up to 100 characters                    |
| `cutoffDate`             | Calendar date in YYYY-MM-DD format; compared as a UTC day |
| `property_id`, `plot_id` | Optional external identifiers, 1–128 characters each      |

The API generates a UUID `validationId`. External IDs are caller references;
they do not establish ownership or CAR registration and are not WFS filters.
Unknown fields are rejected, including `crs` and `bbox` inside the geometry.
See the [Sinop example](../examples/validation-input-sinop.json).

## Geometry and limits

Coordinates are [longitude, latitude] in degrees, within [-180,180] and [-90,90].
Transform other CRS inputs before submission. Rings need at least four positions
and must close exactly. Holes and MultiPolygon components are preserved.
Point, LineString, GeometryCollection, and altitude/Z input are rejected.

The limit is 5,000 positions across all rings, including closing positions, and a
1 MiB HTTP body. There is no area limit or Mato Grosso containment check. Source
coverage remains unknown even when the input is valid.

Structural checks run before SQL. PostGIS then checks topology and requires a
finite, positive area before any source query. No repair, rounding, simplification,
or ring reorientation is applied. See the [geometry policy](geometry-crs-policy.md).

## Errors

- Invalid input: HTTP 400; oversized body: HTTP 413.
- Topologically invalid source event: HTTP 200/INCONCLUSIVE with its feature ID
  and an issue. Valid events still receive measurements.
- Structurally malformed WFS payload: HTTP 503/SOURCE_UNAVAILABLE.
- Local storage or database failure: HTTP 500/INTERNAL_ERROR.

Point or edge contact alone produces `intersectionExists: false`, 0 m², and 0%.
The percentage denominator is property area excluding holes; events are measured
independently, without an aggregated union.
