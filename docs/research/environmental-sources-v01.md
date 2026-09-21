# Environmental Sources v0.1

Research against the public service on **2026-09-18**. Provider:
**INPE / TerraBrasilis**. The endpoints, names, and attributes below were verified
through GetCapabilities, DescribeFeatureType, and GetFeature.

## Technical profiles

| Field              | PRODES                                                                                                                               | DETER                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| provider           | INPE / TerraBrasilis                                                                                                                 | INPE / TerraBrasilis                                                                                                                       |
| dataset            | PRODES Legal Amazon, annual increment                                                                                                | DETER Amazon, public alerts                                                                                                                |
| endpoint           | https://terrabrasilis.dpi.inpe.br/geoserver/prodes-legal-amz/wfs                                                                     | https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/wfs                                                                                  |
| workspace          | prodes-legal-amz                                                                                                                     | deter-amz                                                                                                                                  |
| layer              | prodes-legal-amz:yearly_deforestation                                                                                                | deter-amz:deter_amz                                                                                                                        |
| WFS version        | 2.0.0                                                                                                                                | 2.0.0                                                                                                                                      |
| coverage           | Increment layer since 2008, according to the advertised title; Legal Amazon extent. Does not cover all vegetation in Mato Grosso     | Amazon extent; public alerts with a size filter. Not a complete inventory of all vegetation in Mato Grosso                                 |
| crs                | DefaultCRS EPSG:4674; requested and confirmed output EPSG:4326                                                                       | DefaultCRS EPSG:4674; requested and confirmed output EPSG:4326                                                                             |
| geometry_type      | MultiSurfacePropertyType in XSD; MultiPolygon in sampled GeoJSON                                                                     | MultiSurfacePropertyType in XSD; MultiPolygon in sampled GeoJSON                                                                           |
| geometry_field     | geom                                                                                                                                 | geom                                                                                                                                       |
| temporal_field     | image_date: xsd:date; year: xsd:int                                                                                                  | view_date: xsd:date                                                                                                                        |
| temporal_precision | Image day; year retained as a reporting year when image_date is missing                                                              | Observation day; unknown when view_date is missing                                                                                         |
| feature_id         | feature.id with yearly_deforestation prefix and UUID; uuid is required in XSD. fid is the sort key                                   | feature.id with deter_amz prefix; gid string is the sort key                                                                               |
| update_frequency   | Annual product, subject to revisions; WFS does not guarantee an immutable version                                                    | Daily monitoring with possible publication delays; observation frequency does not guarantee immediate WFS updates                          |
| access_method      | WFS GetFeature GeoJSON; GET and POST application/x-www-form-urlencoded verified                                                      | Same method                                                                                                                                |
| pagination         | count/startIndex, sortBy=fid; ImplementsResultPaging=TRUE                                                                            | count/startIndex, sortBy=gid; ImplementsResultPaging=TRUE                                                                                  |
| known_limitations  | Reporting year/image date do not establish the exact start of clearing; clouds, classes, coverage, and revisions need interpretation | Abstract advertises areatotalkm >=0.0625 km² (6.25 ha); alerts do not represent every occurrence; observation dates do not establish onset |

The advertised bounding box is not a coverage mask. An empty result has not been
shown to establish sufficient observation of the property and period. The adapter
returns `coverage=unknown`, a reason, and `datasetVersion=null`. It does not infer
spatial/temporal validity, an exact update interval, or a dataset version.

Publication of June 2026 data in July 2026 illustrates the difference between
observation and availability; see the [INPE announcement](https://www.gov.br/inpe/pt-br/assuntos/ultimas-noticias/dados-do-deter-referentes-a-junho-de-2026-estao-disponiveis-na-plataforma-terra-brasilis).
The [BiomasBR technical support channel](https://nova-tamoio.dmz.inpe.br/canal-atendimento-biomasbr/)
also distinguishes PRODES datasets suitable for property analysis. Source and
class selection must be included in researcher approval.

## Attribute inventory

The DescribeFeatureType responses inspected on September 18, 2026 listed these attributes.

PRODES: fid (int), geom (MultiSurfacePropertyType), state (string), path_row
(string), main_class (string), class_name (string), def_cloud (decimal), julian_day
(decimal), year (int), area_km (double), scene_id (decimal), source (string),
satellite (string), sensor (string), uuid (required/non-null string), image_date
(date), publish_year (date), sub_class (string), pub_date (string).
`view_date` does not exist in this layer. The other attributes are nullable in XSD.

DETER: gid (string), classname (string), quadrant (string), path_row (string),
view_date (date), sensor (string), satellite (string), areauckm (double), uc
(string), areamunkm (double), municipality (string), mun_geocod (string), uf
(string), publish_month (date), geom (MultiSurfacePropertyType). All are nullable
in XSD. The `areatotalkm` attribute mentioned in the Abstract is a publication
filter and is not an output attribute in this schema.

## Verified operations and parameters

`pnpm research:sources` repeats 16 small queries and writes raw responses and a
manifest to a timestamped directory under `.data/research/`. Supply an explicit
directory as the first argument to choose another location. The manifest includes
method, full URL, POST body, UTC retrieval time, HTTP status, filename,
and SHA-256 of the received UTF-8 bytes. Do not format responses: their hashes
must remain valid. Captures are local output, excluded from version control and
automatic formatting under `.data/`.

Per source: GetCapabilities, DescribeFeatureType, GetFeature count=1/startIndex=0,
GetFeature count=1/startIndex=1, GetFeature through POST, and resultType=hits for
observations after, before/on the cutoff, and without a date. The full Sinop
polygon is in `docs/examples/validation-input-sinop.json`, with cutoff 2020-12-31.

Common GetFeature parameters: service=WFS, version=2.0.0, typeName={layer},
outputFormat=application/json, srsName=EPSG:4326, and sortBy as listed above.
Spatial filter: `INTERSECTS(geom,SRID=4326;POLYGON((...)))`. MultiPolygons and holes
are serialized in full. URLs longer than 7,000 characters use form-urlencoded
POST with the same parameters and no polygon simplification.

| Sinop sample observation    | DETER                                  | PRODES                                 |
| --------------------------- | -------------------------------------- | -------------------------------------- |
| Spatial numberMatched total | 55                                     | 42                                     |
| Each count=1 page           | 1 feature; distinct IDs at indices 0/1 | 1 feature; distinct IDs at indices 0/1 |
| POST at index 0             | Same ID as GET page 0                  | Same ID as GET page 0                  |
| date > 2020-12-31           | 39                                     | 12                                     |
| date <= 2020-12-31          | 16                                     | 30                                     |
| date IS NULL                | 0                                      | 0                                      |

Temporal counts sum to spatial counts in this sample. Zero null dates here does
not establish that the dataset has none: XSD permits them, and the code handles
them. Normal execution uses a **spatial filter only**, preserving older events,
undated events, and the information needed for case B. The decision proposal
applies the cutoff after retrieval. Image/observation dates are not converted
into proof of a later occurrence.

## Pagination, limits, and truncation

| GetCapabilities constraint  | DETER  | PRODES |
| --------------------------- | ------ | ------ |
| CountDefault                | 600000 | 50000  |
| PagingIsTransactionSafe     | FALSE  | FALSE  |
| ImplementsFeatureVersioning | FALSE  | FALSE  |

CountDefault is not an experimentally measured server maximum. No bulk extraction
was performed to discover a physical limit. The count=1 pages demonstrate that
numberReturned can be below numberMatched and that pagination must continue.
The client uses pages of 100, advances startIndex by the actual received count,
and requests stable sorting. It rejects changing totals, missing/empty pages
before completion, duplicate IDs, inconsistent metadata, unexpected CRS,
impossible dates, and invalid payloads. Operational limits are 10,000 combined
events and 30 seconds shared by both sources. Exceeding either returns HTTP 503
without a partial decision. Client limits are not presented as service limits.

Even with stable counts and IDs, WFS does not provide a transactional snapshot;
content can change between pages. Coverage sufficiency and reproducibility of a
future live query remain unproven. To reproduce the processed data, the API
archives actual pages by hash in `.data/source-evidence` or `SOURCE_EVIDENCE_DIR`,
with receipts containing request parameters. The response exposes
`sources/pages/payloadHash`. Replay uses those bytes rather than another server
query. The final blockchain manifest and `evidence_hash` are a separate boundary.
