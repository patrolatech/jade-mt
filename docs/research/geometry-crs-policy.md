# Geometry and CRS Policy

## Source CRS
- TerraBrasilis WFS returns coordinates in degrees (EPSG:4326) despite declaring EPSG:4674
- Verified by inspecting actual coordinate values (longitudes -35 to -65, latitudes -5 to -25)
- All source data is treated as EPSG:4326

## Processing CRS
- Processing CRS: EPSG:4326
- No reprojection needed since source CRS == processing CRS
- If future sources use a different CRS, `ST_Transform(geometry, 4326)` will be applied

## Area Calculation
- **Method**: `ST_Area(geometry::geography)` on WGS84 ellipsoid
- **Unit**: square meters (m²)
- **Precision**: Accurate for all scales (unlike `ST_Area(geometry)` which is in square degrees)
- **Polygon type**: Both `geometry` and `geography` types used; `geography` for area, `geometry` for intersection

## geometry vs geography
| Operation | Type | Reason |
|---|---|---|
| ST_Intersects | geometry | Boolean test, no distance distortion |
| ST_Intersection | geometry | Returns geometry type |
| ST_Area | geography::geometry | Accurate m² on ellipsoid |
| ST_Transform | geometry | Coordinate system change |

## Distortion at Mato Grosso Latitude (~15°S)
- At 15°S, 1 degree of longitude ≈ 110.6 km
- At 15°S, 1 degree of latitude ≈ 110.9 km
- Maximum distortion from using geometry vs geography: ~0.2%
- Using geography type eliminates this distortion entirely

## Invalid Geometry Behavior
- `ST_IsValid(geometry)` returns 't' or 'f'
- `ST_IsValidReason(geometry)` returns explanation string
- **Decision**: Invalid geometries are REJECTED (throw ResearchNotImplementedError)
- Auto-repair with `ST_MakeValid` is NOT implemented without researcher approval
- This policy may change after JADE-ENV-0.1 methodology review

## Empty Geometry
- Empty geometries are rejected by `ST_IsValid` check
- `ST_IsValid(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[]}'))` returns false
- Empty geometry → ResearchNotImplementedError with reason

## Zero-Area Geometry
- Geometry with zero area (e.g., all points collinear) is rejected
- `ST_Area(ST_GeomFromGeoJSON($1))` returns 0 → rejected
- Zero-area → ResearchNotImplementedError

## Boundary-Only Contact
- `ST_Intersects` returns true for boundary-only contact
- `ST_Area(ST_Intersection(...))` returns 0 for boundary-only contact
- Boundary contact with 0 area → NOT counted as intersection
- `intersectionExists` is determined by `ST_Intersects` but `intersectionAreaM2` determines significance

## Overlap and Double Counting
- Each event is analyzed independently
- Multiple events overlapping the same area are NOT deduplicated
- Areas of overlapping events may sum to more than the actual affected area
- This is documented behavior; researcher may add deduplication after methodology approval

## Minimum Intersection Threshold
- Any positive intersection area counts
- No minimum threshold defined yet
- Threshold may be introduced after JADE-ENV-0.1 methodology review