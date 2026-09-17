# Validation Input v0.1

## Accepted Geometry Types
- `Polygon` — Simple polygon with exterior ring
- `MultiPolygon` — Multiple polygons

## Validation Rules
1. **Type check**: Must be Polygon or MultiPolygon (enforced by `GeometrySchema` in TypeBox)
2. **Empty geometry**: Rejected via `ST_IsValid` check in PostGIS
3. **Invalid geometry**: Rejected with `ST_IsValidReason` — NOT auto-repaired without researcher approval
4. **Self-intersection**: Detected by `ST_IsValid`, rejected
5. **Holes**: Supported (valid Polygon with holes passes validation)
6. **Zero-area**: Rejected (area calculation returns 0)
7. **Boundary-only contact**: Included in intersection analysis (documented behavior)

## CRS
- **Input CRS**: EPSG:4326 (WGS84)
- **Processing CRS**: EPSG:4326 (no transformation needed)
- **Source CRS**: Verified EPSG:4326 from TerraBrasilis WFS response
- **Reprojection**: Not needed since source == processing CRS
- **Area unit**: m² via `ST_Area(geometry::geography)` on WGS84 ellipsoid

## Additional Fields
| Field | Type | Required | Description |
|---|---|---|---|
| `geometry` | GeoJSON | Yes | Polygon or MultiPolygon |
| `commodity` | string | Yes | Associated commodity (e.g., soy, cattle) |
| `cutoffDate` | string (date) | Yes | ISO 8601 date (YYYY-MM-DD) |

## Maximum Size
TBD — subject to research. No explicit limit defined yet.

## ID Requirements
- `validationId`: UUID v4 generated per validation request
- `property_id`: Optional property identifier from input
- `plot_id`: Optional plot identifier from input

## Temporal Precision
- `temporalPrecision: 'day'` for DETER (exact detection date)
- `temporalPrecision: 'day'` for PRODES (via `image_date`)
- `temporalPrecision: 'year'` for PRODES (via `year` field, not recommended)
- Missing dates → `temporalPrecision: 'unknown'`, treated as INCONCLUSIVE

## Boundary Behavior
- Polygons that only touch at boundary (no area overlap) are included in intersection analysis
- Boundary contact without area overlap: `intersectionExists = false` (ST_Intersects returns true for boundary contact but ST_Area of intersection is 0)

## Research Decisions (Pending)
- Maximum polygon size
- Whether to allow GeometryCollection
- Coordinate precision tolerance
- Minimum intersection threshold