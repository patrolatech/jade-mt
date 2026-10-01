WITH samples(name, geom) AS (
  VALUES
    ('sinop', ST_MakeEnvelope(-55.6, -12.0, -55.4, -11.8, 4326)),
    ('west_mt', ST_MakeEnvelope(-60.1, -15.1, -59.9, -14.9, 4326)),
    ('east_mt', ST_MakeEnvelope(-52.1, -15.1, -51.9, -14.9, 4326)),
    ('south_mt', ST_MakeEnvelope(-57.1, -17.1, -56.9, -16.9, 4326))
), measurements AS (
  SELECT name, geom, ST_Area(geom::geography) AS ellipsoid_m2,
    ST_Area(ST_Transform(geom, 5880)) AS polyconic_m2,
    ST_Area(ST_Transform(geom, 31981)) AS utm21s_m2,
    ST_Area(ST_Intersection(geom, geom)::geography) AS planar_clip_m2,
    ST_Area(ST_Intersection(geom::geography, geom::geography)) AS geography_clip_m2,
    ST_Area(ST_Transform(ST_SetSRID(geom, 4674), 4326)::geography) AS transformed_sirgas_m2
  FROM samples
)
SELECT name, ellipsoid_m2, polyconic_m2, utm21s_m2, planar_clip_m2,
  geography_clip_m2, transformed_sirgas_m2,
  100 * (polyconic_m2 / ellipsoid_m2 - 1) AS polyconic_difference_percent,
  100 * (utm21s_m2 / ellipsoid_m2 - 1) AS utm_difference_percent
FROM measurements ORDER BY name;

WITH sample AS (
  SELECT ST_GeomFromText('POLYGON((-55.6 -12,-55.4 -11.8,-55.6 -11.8,-55.4 -12,-55.6 -12))', 4326) AS geom
)
SELECT ST_IsValid(geom) AS original_valid, ST_IsValidReason(geom) AS reason,
  ST_IsValid(ST_MakeValid(geom)) AS repaired_valid,
  GeometryType(ST_MakeValid(geom)) AS repaired_type,
  ST_AsGeoJSON(ST_MakeValid(geom)) AS repaired_geojson
FROM sample;
