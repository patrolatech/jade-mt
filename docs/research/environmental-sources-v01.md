# Environmental Sources v0.1

## Provider
INPE / TerraBrasilis

## Datasets

### PRODES — Annual Deforestation in the Legal Amazon
| Field | Value |
|---|---|
| Dataset | PRODES (Programa de Monitoramento do Desmatamento na Amazonia Legal por Satelite) |
| Endpoint | `https://terrabrasilis.dpi.inpe.br/geoserver/prodes-legal-amz/wfs` |
| Workspace | `prodes-legal-amz` |
| Layer | `prodes-legal-amz:yearly_deforestation` |
| WFS Version | 2.0.0 |
| CRS Declared | EPSG:4674 (SIRGAS 2000) |
| CRS Actual | EPSG:4326 (WGS84) — coordinates in degrees |
| Processing CRS | EPSG:4326 |
| Geometry Type | MultiPolygon |
| Temporal Fields | `view_date` (xsd:date), `image_date` (xsd:date), `year` (xsd:int) |
| Temporal Precision | Day (via image_date), Year (via year) |
| Access Method | WFS GetFeature with CQL_FILTER |
| Pagination | count=100, startIndex, sortBy=fid |
| Format | application/json |
| Update Frequency | Annual (crop-year August–July) |
| Known Limitations | `year` is crop-year not exact date; INTERSECTS(WKT) CQL fails on current GeoServer version |

### DETER — Real-Time Deforestation Detection
| Field | Value |
|---|---|
| Dataset | DETER (Deteccao de Desmatamento em Tempo Real) |
| Endpoint | `https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/wfs` |
| Workspace | `deter-amz` |
| Layer | `deter-amz:deter_amz` |
| WFS Version | 2.0.0 |
| CRS Declared | EPSG:4674 (SIRGAS 2000) |
| CRS Actual | EPSG:4326 (WGS84) — coordinates in degrees |
| Processing CRS | EPSG:4326 |
| Geometry Type | MultiPolygon |
| Temporal Fields | `view_date` (xsd:date) |
| Temporal Precision | Day (exact detection date) |
| Access Method | WFS GetFeature with CQL_FILTER |
| Pagination | count=100, startIndex, sortBy=gid |
| Format | application/json |
| Update Frequency | Daily |
| Known Limitations | Public layer filtered by areatotalkm >= 0.0625 km²; INTERSECTS(WKT) CQL fails on current GeoServer version |

## WFS Parameters
```
service=WFS&version=2.0.0&request=GetFeature&typeName={layer}&outputFormat=application/json&srsName=EPSG:4326&CQL_FILTER={filter}&count=100&sortBy={field}&startIndex=0
```

## CQL Filters
- DETER: `view_date > 'YYYY-MM-DD'`
- PRODES: `image_date > 'YYYY-MM-DD'`

## Temporal Rule
- DETER: `view_date` is an exact date (xsd:date). Direct comparison with cutoff date.
- PRODES: `image_date` is the image acquisition date (xsd:date). More precise than `year` which is a crop-year integer.
- For cutoff_date 2020-12-31: `image_date > '2020-12-31'` captures post-cutoff events.
- `year >= 2021` also works for PRODES since year=2020 is crop-year Aug 2019–Jul 2020 (before cutoff).

## CRS Discrepancy
TerraBrasilis WFS declares EPSG:4674 in metadata but returns coordinates in degrees (EPSG:4326). All geometric operations use EPSG:4326. Area calculations use `ST_Area(geometry::geography)` on the WGS84 ellipsoid for accurate m².

## Evidence Samples
Raw WFS responses are preserved in `source-data/raw_responses/`. Each response is hashed with SHA-256 and recorded in the EvidenceManifestV01 sources array.

## Limitations
1. CQL spatial filter `INTERSECTS(geom, WKT)` fails on current GeoServer version; spatial intersection is performed locally via PostGIS.
2. `areatotalkm >= 0.0625 km²` filter on DETER public layer means smaller alerts are not visible.
3. PRODES `year` field is crop-year, not exact deforestation date; use `image_date` for precision.
4. WFS pagination limited to 3 pages (300 features) in the PoC.
5. GeoServer REST API requires authentication (HTTP 401).