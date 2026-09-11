# JADE-MT

Environmental Validation Research Prototype · UFMT master's research

This repository is the engineering starting point for a researcher and two interns.
It separates environmental screening, evidence representation, and blockchain
attestation so each research track can progress independently. It is **not the
complete JADE-MT platform** and does not implement an approved environmental methodology.

`PASS`, `FAIL`, `INCONCLUSIVE`, and `ERROR` describe environmental screening outcomes.
**PASS must never be presented as “EUDR compliant.”** Full legal compliance requires
additional requirements outside this prototype.

## Architecture

```text
apps/
  web/                      Vite + React + TypeScript; small workspace smoke page
  api/                      Fastify HTTP validation and dependency composition
packages/
  schemas/                  TypeBox schemas and shared TypeScript types
  database/                 pg pool, migrations, GeometryRepository, PostGIS stub
  environmental-oracle/     sources → per-event analysis → pending decision rule
  evidence/                 provisional manifest, canonicalization boundary, SHA-256
  stellar/                  off-chain attestation client interface and explicit stub
contracts/
  jade-attestation/         Rust/Soroban authorization, attest, retrieve, revoke
infra/
  docker-compose.yml        PostgreSQL/PostGIS only
  postgres/                 PostGIS extension initialization
docs/
  architecture/             responsibilities and integration flow
  methodology/              JADE-ENV-0.1 template, not an invented methodology
  research/                 unresolved decisions and ownership
```

The integration boundary is **EvidenceManifestV01**, defined once in `@jade/schemas`
and re-exported by `@jade/evidence`:

```text
Polygon → environmental-oracle → PostGIS → JADE-ENV methodology
  → EvidenceManifest → canonicalization → SHA-256 → evidence_hash → Soroban attest()
```

Arrows describe the intended flow; the research stages are explicitly incomplete.
The API contains no environmental algorithm, the oracle contains no blockchain
logic, and the contract knows only attestations. ESLint rejects app/Fastify imports
from packages and Stellar imports from the oracle.

## Technology and versions

Node.js 24, pnpm workspaces, strict TypeScript, Fastify, TypeBox, `pg`, Vite/React,
Vitest, ESLint and Prettier form the off-chain workspace. PostgreSQL 17/PostGIS 3.5
is the geospatial engine. Rust is used only in the Cargo contract workspace.

Dependency versions are pinned and both lockfiles are included for reproducible installs.
TypeScript **6.0.3** is selected because the current `typescript-eslint` supports
TypeScript below 6.1; upgrading to TypeScript 7 would violate its peer range.
pnpm **10.34.5** is pinned because this environment's Corepack cannot launch pnpm 12.
Vite 8, React 19, Fastify 5 and Soroban SDK **27.0.6** are pinned in their manifests.
Check the target network protocol before any future deployment; no network is
selected or deployed by this starter.

## Run locally

Prerequisites: Node.js 24, pnpm 10.34.5 (or Corepack), Docker with Compose 2.20+.
If needed, enable Corepack with `corepack enable`. Rust is only needed for contracts.

From the repository root:

```bash
docker compose up -d
pnpm install
pnpm dev
```

The database normally becomes healthy during dependency installation. If starting
against a cold image and an already-installed workspace, use
`docker compose up -d --wait` before `pnpm dev`.

`pnpm dev` applies pending database migrations, compiles the shared packages, then
starts package compiler watchers, the API watcher and Vite. Package edits rebuild
their public exports and restart the API through its explicit package watch glob.
No global task runner is required.

- Web: <http://127.0.0.1:5173>
- API: <http://127.0.0.1:3000/health>
- Database: `127.0.0.1:5432`, database/user `jade`, password `jade_dev` (local only).

Configuration has working local defaults. Optionally copy `.env.example` to `.env`;
the API and migration runner load this root file. Database integration tests also
load the root `.env`. `DATABASE_URL`, `API_HOST`, `API_PORT`, and `LOG_LEVEL` are
configurable. Database Docker credentials/port are configured in Compose.
The root `compose.yaml` includes `infra/docker-compose.yml` so the startup command
works unchanged from the repository root. The PostGIS image uses amd64 emulation
on Apple Silicon.

Try the intentional stub:

```bash
curl -i http://127.0.0.1:3000/validations \
  -H 'Content-Type: application/json' \
  --data @docs/examples/validation-input.json
```

A structurally valid request returns **501 `RESEARCH_NOT_IMPLEMENTED`**, naming the
pending TerraBrasilis boundary. Invalid request bodies return 400. After an adapter
is supplied, source transport failures return 503; unexpected execution failures
return 500. These HTTP errors are not fabricated `ValidationResult` objects. A real
200 result requires the source, geometry policy and decision rule to be implemented
or explicitly supplied by a synthetic unit test.

The API checks PostGIS availability at startup and closes its pool on shutdown.
`/health` is a liveness endpoint, not a continuous database readiness probe.
The tables are available for experimentation; the endpoint does not yet persist
requests, create manifests, or submit attestations.

## Checks and scripts

```bash
pnpm build                 # libraries, API, static web bundle
pnpm typecheck             # strict checks, including test sources
pnpm lint                  # ESLint, including module boundaries
pnpm test                  # offline Vitest unit tests
pnpm test:integration      # migrations + real local PostGIS tests
pnpm format:check
pnpm smoke                 # with pnpm dev running; checks API + Vite HTTP imports
cargo test --workspace
cargo fmt --check
```

`pnpm check` combines the offline checks and Cargo tests. It excludes the explicit
PostGIS integration suite, which requires Docker. `pnpm format` and `cargo fmt`
apply formatting. `pnpm db:migrate` safely reapplies only pending migrations using
a transaction, advisory lock and `schema_migrations` ledger. `pnpm build:packages`
prepares workspace imports before running an individual app/package in isolation.

See [the setup validation record](docs/validation.md) for the commands actually run,
results, intentional skips and compatibility fixes during scaffolding.

The four environmental scenarios in `validate-environmental-origin.test.ts` are
**intentionally skipped research hypotheses**, not passing scientific tests:

| Scenario                      | Initial expectation | Pending investigation                  |
| ----------------------------- | ------------------- | -------------------------------------- |
| A: no intersection            | PASS                | completeness and spatial rule          |
| B: intersection before cutoff | initially PASS      | temporal precision/rule                |
| C: intersection after cutoff  | FAIL                | source role and intersection threshold |
| D: source unavailable         | INCONCLUSIVE        | failure-to-result policy               |

Their bodies call the default workflow and will fail if merely unskipped today.
Active tests exercise orchestration, request validation, transport failures,
explicit incomplete boundaries and the SHA-256 known-answer vector. They use
synthetic geometries and mocked transport, never government APIs. Integration
tests only parse a synthetic geometry and verify the database schema; they do
not certify area, CRS or intersection methodology.

## Deliberately incomplete

- Real TerraBrasilis endpoints, layers, temporal fields, WFS filtering/paging and
  event mapping; future sources can implement the same `EnvironmentalSource`.
- CRS, geometry normalization/validity policy, precision, percentages, thresholds,
  spatial aggregation, temporal rules, source hierarchy and missing-data behavior.
- JADE-ENV-0.1 itself: the decision rule throws until researched and approved.
- Evidence manifest finalization, geometry/payload byte definitions, canonical
  evidence representation, storage and retrieval. Canonicalization has **no default**.
- Stellar bindings, signing, simulation, submission, confirmation and restoration.
- Final on-chain schema, storage economics, TTL extension, archival and restoration.

See the [methodology template](docs/methodology/JADE-ENV-0.1.md) and
[central research register](docs/research/open-questions.md).

## Intern 1 — Blockchain/Evidence

Primary ownership: `packages/evidence`, `packages/stellar`, `contracts/jade-attestation`.

Start with:

1. `packages/schemas/src/index.ts` — review `EvidenceManifestV01` jointly with Intern 2.
2. `packages/evidence/src/canonicalize-evidence.ts` and `hash-evidence.ts`.
3. `contracts/jade-attestation/src/lib.rs` and `src/test.rs`.
4. `packages/stellar/src/index.ts`.

Research: canonical evidence representation, evidence hashing, minimal on-chain
schema, authorization, Soroban storage, TTL, archival/restoration and transaction
cost. The initial model has one deployment-time admin, also the only validator.
The admin authorizes both attestation and revocation. IDs cannot be overwritten,
including after revocation. Revocation is idempotent.

Instance configuration and persistent attestations are **storage hypotheses**.
The contract deliberately does not extend TTL. One ignored Rust test identifies
the missing lifecycle investigation. Native tests and a Wasm build do not validate
multi-year availability. See the [contract README](contracts/jade-attestation/README.md).

## Intern 2 — Environmental/GIS

Primary ownership: `packages/environmental-oracle` and geospatial queries in
`packages/database`.

Start with:

1. `packages/environmental-oracle/src/sources/terrabrasilis.source.ts`.
2. `packages/database/src/postgis-geometry-repository.ts` and `sql/intersection-research.sql`.
3. `packages/environmental-oracle/src/validation/decision-rule.ts` and its workflow tests.
4. `docs/methodology/JADE-ENV-0.1.md`.

Research: real TerraBrasilis endpoints, PRODES/DETER layers, temporal fields, WFS
filters, CRS, geometry normalization, intersection behavior, temporal rule inputs,
and source limitations. Do not interpret missing data as an absence of events.

## Main researcher and shared work

The main researcher owns methodology approval, scope, API composition and
integration review. Both interns coordinate changes to shared schemas, evidence
fields and the methodology version. Record research decisions and supporting
observations before enabling the corresponding skipped tests. Do not turn fixtures
into undocumented scientific policy.

## Technical references

- [Vite guide](https://vite.dev/guide/)
- [Fastify documentation](https://fastify.dev/docs/latest/)
- [Official PostGIS image](https://github.com/postgis/docker-postgis)
- [Soroban SDK 27.0.6](https://docs.rs/soroban-sdk/27.0.6/soroban_sdk/)
- [Stellar authorization](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization)
