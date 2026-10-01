# Geometry and CRS policy

Experimental spatial policy; approval is pending in
[JADE-ENV-0.1](../methodology/JADE-ENV-0.1.md).

## Coordinates and operations

PRODES and DETER capabilities declare EPSG:4674 (SIRGAS 2000). The adapter sends
SRID=4326 filters and requests EPSG:4326 output, rejecting responses with missing
or different CRS metadata. WFS performs the requested transformation.
`ST_SetSRID` only labels coordinates; it does not reproject them.

| Operation          | Implementation                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Parse and validate | `ST_GeomFromGeoJSON`, `ST_IsValid`, `ST_IsValidReason`; reject empty or non-positive-area geometry |
| Intersect          | `ST_Intersection` on geometry 4326, using GeoJSON planar edges                                     |
| Measure            | `ST_Area(intersection::geography)` in m²                                                           |
| Percentage         | 100 × intersection area / property area excluding holes; capped at 100% per event                  |

Positive area defines an intersection; point and edge contact return zero.
Events are measured independently, so overlapping event areas must not be summed
as a union. There is no scientific epsilon or automatic geometry repair.
`ST_MakeValid` appears only in research and tests: it changed a self-intersecting
Polygon to a MultiPolygon in the recorded experiment.

Geometry intersection followed by geography area is a prototype choice. Long
edges, densification, tolerances, and a processing projection need review. The
alternative [geography intersection](https://postgis.net/docs/ST_Intersection.html)
selects a projection internally and can produce a different boundary.

## Recorded experiments

[The SQL worksheet](../../packages/database/sql/intersection-research.sql) compares
0.2° rectangles at four Mato Grosso locations. In the September 18, 2026 run,
area differences relative to ellipsoidal area were:

| Sample | Brazil Polyconic 5880 | SIRGAS UTM 21S 31981 |
| ------ | --------------------- | -------------------- |
| Sinop  | +0.03297%             | −0.01396%            |
| West   | +0.51471%             | +0.17763%            |
| East   | +0.05715%             | +0.63774%            |
| South  | +0.12608%             | −0.07999%            |

These are sample comparisons, not universal error bounds. The 4674→4326
transformation preserved numeric coordinates in this PROJ installation; this
does not establish datum equivalence. The Sinop partial-intersection test uses
a 0.2% tolerance against an independently calculated area in EPSG:5880.

Run `pnpm research:geometry` with local PostGIS to create a new capture under
`.data/research/`, including PostGIS/GEOS/PROJ versions. Generated results are not
committed. Do not extrapolate these tests to continental or
antimeridian-crossing polygons.
