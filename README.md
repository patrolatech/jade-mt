# JADE-MT

Experimental environmental screening with PRODES/DETER and PostGIS. The API returns
measurements, source receipts, and INCONCLUSIVE while
[JADE-ENV-0.1](docs/methodology/JADE-ENV-0.1.md) awaits scientific approval.
The web app is a static prototype; Stellar publication is not implemented.

## Local development

Requires Node 24, pnpm 10.34.5, and Docker.

```bash
docker compose up -d
pnpm install
pnpm dev
```

Web: http://127.0.0.1:5173. API: http://127.0.0.1:3000/health.
PostGIS: `127.0.0.1:5432`, database/user `jade`, development password `jade_dev`.
`pnpm dev` applies migrations; use `pnpm db:migrate` when running services separately.

## API

```bash
curl -i --max-time 60 http://127.0.0.1:3000/validations \
  -H 'Content-Type: application/json' \
  --data-binary @docs/examples/validation-input-sinop.json
```

`POST /validations` accepts a closed 2D Polygon/MultiPolygon in EPSG:4326 [lon,lat],
`commodity`, `cutoffDate` (YYYY-MM-DD), and optional `property_id`/`plot_id`.
Limits: 5,000 positions and a 1 MiB body. See the
[request contract](docs/research/validation-input-v01.md).

PRODES and DETER Amazon are queried by default. `ENVIRONMENTAL_DATASETS` selects
`PRODES`, `DETER`, or both. Source retrieval is limited to 10,000 combined events
and 30 seconds. Coverage remains unknown; observation dates do not establish exact
occurrence dates. See the [source profiles](docs/research/environmental-sources-v01.md).

Responses contain `validationId`, `status`, `eventsFound`, `sources`, `eventAnalyses`,
and `issues`. Areas are in m²; percentages use property area excluding holes.
Events are measured separately, without summing overlapping areas. Invalid input
returns 400 (oversized body: 413), source failures 503, and internal failures 500.

Retrieve a saved execution using its returned ID:

```bash
curl http://127.0.0.1:3000/validations/REPLACE_WITH_VALIDATION_ID
```

GET returns the saved input, result/error, execution state, and provenance without
querying WFS. Unknown UUIDs return 404; malformed UUIDs return 400. Every POST
starts a new consultation. Persistence and failure recovery are described in the
[database model](docs/architecture/database-model.md).

Raw pages and receipts stay in ignored `.data/source-evidence`, configurable with
`SOURCE_EVIDENCE_DIR`. Research captures stay in ignored `.data/research`. Back up
PostgreSQL and the archive together; raw data is not committed to this repository.

## Commands

| Command                        | Purpose                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| `pnpm check`                   | Build, typecheck, lint, formatting, unit tests, and contract checks |
| `pnpm test`                    | Offline TypeScript tests                                            |
| `pnpm test:integration`        | Migrations and real PostGIS tests                                   |
| `pnpm research:sources`        | Capture small WFS queries locally                                   |
| `pnpm research:geometry`       | Run PostGIS CRS and area experiments                                |
| `pnpm test:live`               | Capture an API validation using WFS and PostGIS                     |
| `pnpm test:replay <directory>` | Replay a local capture without WFS                                  |
| `pnpm smoke`                   | Check running API and web services, including a live query          |

See [package boundaries](docs/architecture/monorepo.md),
[validation flow](docs/architecture/environmental-flow.md), and
[research notes](docs/research/README.md).

Scripts use TypeScript/`tsx` and are included in `pnpm typecheck`. Keep documentation
in English, use `date-fns` for date comparisons, and reserve comments for non-obvious
technical constraints.
