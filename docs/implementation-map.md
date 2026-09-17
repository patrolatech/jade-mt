# JADE-MT Migration — Implementation Map

**Branch:** `intern-gis-migration`  
**Commit:** `c4d66e4`

---

## 1. Sources & Endpoints

| File | What it does |
|------|-------------|
| `packages/environmental-oracle/src/sources/terrabrasilis.source.ts` | `TerraBrasilisSource` — WFS adapter for PRODES/DETER endpoints. Builds CQL filters (`view_date > cutoff` for DETER, `image_date > cutoff` for PRODES). Fetches features, maps to `EnvironmentalEvent` objects. Uses `@jade/evidence` for provenance. |
| `packages/environmental-oracle/src/sources/environmental-source.ts` | `EnvironmentalSource` interface — defines `fetchEvents` contract. `EnvironmentalSourceUnavailableError` for source failures. |

## 2. Database & PostGIS

| File | What it does |
|------|-------------|
| `packages/database/src/postgis-geometry-repository.ts` | `PostgisGeometryRepository` — `analyzeIntersection()` uses `ST_GeomFromGeoJSON`, `ST_IsValid`, `ST_Intersects`, `ST_Area(geometry::geography)` for m². Processing CRS EPSG:4326. |
| `packages/database/src/pool.ts` | `createDatabasePool` — PostgreSQL connection pool via `pg` package. |
| `packages/database/sql/intersection-research.sql` | Approved parameterized SQL queries for intersection research with decisions documented. |

## 3. Validation & Decision Rules

| File | What it does |
|------|-------------|
| `packages/environmental-oracle/src/validation/decision-rule.ts` | `decideEnvironmentalStatus()` — PASS/FAIL/INCONCLUSIVE/ERROR logic. `classifySourceError()`, `classifyIncompleteData()`. |
| `packages/environmental-oracle/src/validation/validate-environmental-origin.ts` | `validateEnvironmentalOrigin()` — orchestrates source → geometry repo → decision rule pipeline. |
| `packages/environmental-oracle/src/validation/validate-environmental-origin.test.ts` | Tests for orchestration boundaries and JADE-ENV-0.1 research hypotheses A/B/C/D. |

## 4. Evidence Package

| File | What it does |
|------|-------------|
| `packages/evidence/src/index.ts` | `computeSha256()`, `computeSha256Buffer()`, `nowIso()`, `createEvidenceManifest()` — `EvidenceManifestV01` interface. |
| `packages/evidence/package.json` | Evidence package dependencies including `@jade/schemas`. |

## 5. API Application

| File | What it does |
|------|-------------|
| `apps/api/src/app.ts` | Fastify app — `POST /validations` endpoint, validation schema, error handling (500/501/503). |
| `apps/api/src/app.test.ts` | API tests — invalid requests, oracle calls, error mapping (`EnvironmentalSourceUnavailableError` → 503). |

## 6. Documentation

| File | What it does |
|------|-------------|
| `docs/research/environmental-sources-v01.md` | TerraBrasilis source profile — endpoints, layers, CQL filter syntax, pagination. |
| `docs/research/validation-input-v01.md` | Validation input specification — geometry format, CRS policy (EPSG:4326). |
| `docs/research/geometry-crs-policy.md` | CRS and area calculation policy — `ST_Area(geometry::geography)` for m², SRID 4326. |
| `docs/methodology/JADE-ENV-0.1.md` | Methodology template — JADE-ENV environmental screening process. |
| `docs/research/open-questions.md` | Open research questions and gaps. |
| `docs/examples/validation-input.json` | Example validation input payload. |

## 7. Configuration & Root

| File | What it does |
|------|-------------|
| `README.md` | Project overview, architecture, commands, test status. |
| `pnpm-workspace.yaml` | Workspace config — `packages/*` and `apps/*` glob patterns. |
| `packages/environmental-oracle/src/index.ts` | Public API exports — endpoints, layers, classify functions. |
| `packages/environmental-oracle/package.json` | Dependencies including `@jade/evidence`, `@jade/schemas`. |
| `packages/database/package.json` | Database package dependencies. |
