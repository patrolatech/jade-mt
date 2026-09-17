-- APPROVED INTERSECTION RESEARCH QUERIES
-- All inputs bound as parameterized query parameters.
-- Processing SRID: 4326 (EPSG:4326, matches WFS actual coordinate format).
-- Source CRS: Verified EPSG:4326 from TerraBrasilis WFS response.
-- No reprojection needed since source == processing CRS.

-- 1. Validate geometry
-- SELECT ST_IsValid(ST_GeomFromGeoJSON($1)) AS valid, ST_IsValidReason(ST_GeomFromGeoJSON($1)) AS reason;

-- 2. Create geometry with SRID label
-- SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom;

-- 3. Reprojection (if source CRS differs from processing CRS)
-- SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), source_srid), 4326) AS geom;

-- 4. Invalid geometry handling (REJECT, do NOT auto-repair without researcher approval)
-- SELECT ST_IsValid(ST_GeomFromGeoJSON($1));
-- If false, throw ResearchNotImplementedError with ST_IsValidReason

-- 5. Spatial intersection test
-- SELECT ST_Intersects(
--   ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
--   ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)
-- ) AS intersects;

-- 6. Spatial intersection geometry
-- SELECT ST_Intersection(
--   ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
--   ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)
-- ) AS intersection_geom;

-- 7. Area calculation using geography type for accurate m2 on WGS84 ellipsoid
-- SELECT ST_Area(geom::geography) AS area_m2 FROM (
--   SELECT ST_Intersection(
--     ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
--     ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)
--   ) AS geom
-- ) sub;

-- 8. Property area for percentage denominator
-- SELECT ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography) AS area_m2;

-- 9. Combined intersection analysis
-- WITH property_geom AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom),
--      event_geom AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($2), 4326) AS geom)
-- SELECT
--   ST_Intersects(p.geom, e.geom) AS intersects,
--   ST_Area(ST_Intersection(p.geom::geography, e.geom::geography)) AS intersection_area_m2,
--   ST_Area(p.geom::geography) AS property_area_m2
-- FROM property_geom p, event_geom e;

-- Research decisions applied:
-- - Processing CRS: EPSG:4326 (no transformation needed)
-- - Invalid geometry: REJECT (not auto-repaired without researcher approval)
-- - Area calculation: ST_Area(geometry::geography) for m2 on WGS84 ellipsoid
-- - Percentage denominator: property area (ST_Area(property_geom::geography))
-- - Empty geometry: REJECT via ST_IsValid check
-- - Zero-area: REJECT
-- - Boundary-only contact: Included in intersection (documented behavior)
-- - Overlap/double counting: Each event analyzed independently (no deduplication)
-- - Minimum threshold: Any positive intersection area counts (documented, researcher may change)