# JADE-MT Environmental Validation Research Prototype

## Architecture

```
apps/
  api/                      Fastify HTTP validation and dependency composition
packages/
  schemas/                  TypeBox schemas and shared TypeScript types
  database/                 pg pool, migrations, GeometryRepository, PostGIS implementation
  environmental-oracle/     sources → per-event analysis → decision rule
  evidence/                 evidence manifest, SHA-256
infra/                      Docker Compose PostgreSQL/PostGIS
docs/
  research/                 unresolved decisions and research documentation
  methodology/              JADE-ENV-0.1 template
```

## Integration Boundary

```
Polygon → environmental-oracle → PostGIS → JADE-ENV methodology
  → EvidenceManifest → canonicalization → SHA-256 → evidence_hash → Soroban attest()
```

## Run Locally

```bash
docker compose up -d
pnpm install
pnpm dev
```

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:3000/health
- Database: 127.0.0.1:5432, database/user jade, password jade_dev

## Commands

```bash
pnpm build              # libraries, API, static web bundle
pnpm typecheck          # strict checks
pnpm lint               # ESLint
pnpm test               # offline Vitest unit tests
pnpm test:integration   # migrations + real local PostGIS tests
pnpm db:migrate         # apply pending migrations
```

## Test Cases (Environmental Hypotheses)

| Case | Scenario | Expected | Status |
|---|---|---|---|
| A | No intersection | PASS | Implemented |
| B | Intersection before cutoff | PASS | Implemented |
| C | Intersection after cutoff | FAIL | Implemented |
| D | Source unavailable | INCONCLUSIVE/ERROR | Implemented |

## Deliberately Incomplete

- Real TerraBrasilis endpoints, layers, temporal fields, WFS filtering/paging
- CRS, geometry normalization/validity policy, precision, percentages
- JADE-ENV-0.1 decision rule
- Evidence manifest finalization
- Stellar/Soroban bindings
- Final on-chain schema

## Research Documentation

- `docs/research/environmental-sources-v01.md` — TerraBrasilis source profile
- `docs/research/validation-input-v01.md` — Input geometry and CRS policy
- `docs/research/geometry-crs-policy.md` — CRS, area calculation, invalid geometry rules
- `docs/research/open-questions.md` — Open research questions