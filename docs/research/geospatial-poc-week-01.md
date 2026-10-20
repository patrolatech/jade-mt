# Geospatial PoC — week 01 (05–09 Out)

Estagiário 2 (GIS / Oráculo Ambiental). Consolidation executed 19–20 Oct 2026
(local) on branch `intern-gis-atividades-semana-05-09-out`, based on `master`
at `90231e2` (PRs #29 and #30).

Flow under test: `geometry → source → events → PostGIS → rule → ValidationResult`,
with the production API remaining `INCONCLUSIVE` (methodology `JADE-ENV-0.1`
draft) and `PASS`/`FAIL` reachable only through the injected
`evaluateDecisionProposal` in controlled tests.

## Deliverables

| Artifact                                                   | Purpose                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `scripts/research-metrics.ts`                              | shared phase timing, git/runtime metadata, masked database URLs           |
| `scripts/verify-environmental-api.ts` (rewritten)          | live capture with phase metrics + `metrics.json`/`metadata.json`          |
| `scripts/replay-environmental-api.ts` (rewritten)          | offline replay with the same instrumentation, per-run metrics files       |
| `apps/api/src/decision-proposal.integration.test.ts` (new) | controlled A/B/C/D1/D2/D3 decision cases against real PostGIS             |
| `docs/examples/evidence-handoff/` (new)                    | versioned synthetic fixture: input, page bytes, result, manifest          |
| `docs/research/oracle-evidence-handoff-v01.md` (new)       | field mapping `ValidationResult` → `EvidenceManifestV01`, with pendências |
| this document                                              | week report: captures, cases, performance, limits                         |

## 1. Capture and replay

Base capture reused as agreed: `.data/research/semana-05-09-out-sinop`
(captured 15 Oct, `docs/examples/validation-input-sinop.json`, 97 events =
42 PRODES + 55 DETER, 135 531 bytes across 2 pages).

- `pnpm test:replay <dir>` replays without external network: the instrumented
  `fetch` serves archived bytes, verifies each page's SHA-256 against the
  receipt **before** returning them (PR #30 contract — hashes are never
  recomputed from parsed JSON), and asserts the result equals the captured
  `result.json` (status, eventsFound, every `eventAnalyses` entry, every
  issue).
- Each replay writes `metrics.replay-<timestamp>.json` plus the last run to
  `metrics.replay.json` next to the capture; four consecutive runs all passed.
- `pnpm test:live <dir>` re-verified the full live path with the new
  instrumentation on 19 Oct into a **new** directory
  (`.data/research/live-check-19-10`), leaving the base capture untouched.

## 2. Performance

All numbers from this machine's PostGIS stack (below). `networkMs`
accumulates every `fetch` call (PRODES and DETER run concurrently, so it can
exceed wall-clock phases); in replay it is local archive read + hash
verification, not network.

### Live capture (19 Oct, real WFS + persistence)

| Phase                       | ms      |
| --------------------------- | ------- |
| `networkMs` (2 pages)       | 4 452.8 |
| `sourcePhaseMs` (wall)      | 3 980.3 |
| `geometryMs` (PostGIS loop) | 109.6   |
| `persistenceStartMs`        | 7.7     |
| `persistenceCompleteMs`     | 142.0   |
| `totalMs` (whole request)   | 4 312.3 |

Result: HTTP 200, `INCONCLUSIVE`, 97 events, 85 measurements, issues
`INVALID_EVENT_GEOMETRY`, `METHODOLOGY_PENDING_APPROVAL`,
`INSUFFICIENT_COVERAGE`, `UNCERTAIN_EVENT_DATE`.

### Offline replay of the base capture (4 consecutive runs)

| Run | `networkMs` (local read+hash) | `sourcePhaseMs` | `geometryMs` | `totalMs` |
| --- | ----------------------------- | --------------- | ------------ | --------- |
| 1   | 25.4                          | 16.1            | 133.9        | 218.6     |
| 2   | 35.9                          | 23.4            | 143.0        | 238.1     |
| 3   | 24.3                          | 15.6            | 133.9        | 216.4     |
| 4   | 31.6                          | 20.3            | 160.2        | 255.2     |

- `totalMs` mean 232.1 ms (min 216.4 / max 255.2); `geometryMs` mean 142.8 ms.
- `persistence*Ms = 0` by design: replay runs the app offline (no
  `validationPersistence`), so persistence cost is only measured live
  (142.0 ms for `complete` above).
- Every run verified 2 pages / 135 531 bytes with identical assertions.

## 3. Controlled decision cases (real PostGIS)

`apps/api/src/decision-proposal.integration.test.ts` — disposable database,
manual migrations, real `PostgisGeometryRepository` intersections, synthetic
source that archives one real payload page (hash over committed bytes) and
links every event's `provenance` to it, `evaluateDecisionProposal` injected:

| Case | Setup                                                      | Expected                                           | Status |
| ---- | ---------------------------------------------------------- | -------------------------------------------------- | ------ |
| A    | disjoint event, `coverage: sufficient`                     | `PASS`, area 0                                     | ✅     |
| B    | overlapping event, occurrence `2020-01-01` (before cutoff) | `PASS`, area > 0                                   | ✅     |
| C    | overlapping event, occurrence `2021-06-15` (after cutoff)  | `FAIL`, area > 0                                   | ✅     |
| D1   | overlap but `coverage: unknown`                            | `INCONCLUSIVE` + `INSUFFICIENT_COVERAGE`           | ✅     |
| D2   | overlap, `observedAt: null`, temporal basis `unknown`      | `INCONCLUSIVE`                                     | ✅     |
| D3   | source throws `EnvironmentalSourceUnavailableError`        | HTTP 503 `SOURCE_UNAVAILABLE`, no partial decision | ✅     |

Nothing here changes the production path: the same build with the default
dependencies still returns `INCONCLUSIVE` (verified again in section 4).

## 4. Persistence demonstration (POST → restart → GET)

Using the rebuilt API (`apps/api/dist` had to be rebuilt — the previous
binary was stale, from 16 Sep, and exposed no GET route) against a throwaway
database `jade_demo_week01` (migrations 001–003), real WFS:

1. `POST /validations` (sinop input) → HTTP 200 in 4.37 s,
   `validationId 4f012f6f-45b3-4833-ad00-cdec3d6827f4`, `INCONCLUSIVE`,
   97 events, 85 measurements.
2. Server fully stopped (port free), new process started on the same
   database.
3. `GET /validations/:id` → HTTP 200 with `executionStatus: completed`,
   `result` deep-equal to the POST body, original `input`, **2 archived page
   receipts** (`storageKey` per payload hash), `runtimeVersions`
   (node/postgresql/postgis) and `processingVersion`.

The demo database was dropped afterwards; archived page bytes remain under
the git-ignored `.data/` tree.

## 5. Evidence handoff

`docs/research/oracle-evidence-handoff-v01.md` maps every
`EvidenceManifestV01` field to its oracle origin and pendências, referencing
`evidence-manifest-v01.md` and `evidence-hashing.md`. The fixture in
`docs/examples/evidence-handoff/` was verified in-repo:

- manifest validates against `EvidenceManifestV01Schema` (formats registered);
- `geometryHash` and `payloadHash` recomputed from the committed bytes match;
- `evidenceHash = 713c02b65cf4419fd6805621a0b5020c50c439e1e14c33e5c9698305aba0d97c`;
- per-event areas are real PostGIS `ST_Area(...::geography)` values, while
  manifest aggregates stay `null` (no approved aggregation policy).

## Environment fingerprint

| Item                | Value                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| Base commit         | `90231e2` (PR #29 + #30), branch `intern-gis-atividades-semana-05-09-out` |
| `processingVersion` | `sha256:001860c975aa25da647a48981be8ffab8cd8bb9f473b97775c91418065778623` |
| Node                | v24.14.0                                                                  |
| PostgreSQL          | 17.5 (`postgis/postgis:17-3.5`, port 5434)                                |
| PostGIS             | 3.5.2 (GEOS 3.9.0, PROJ 7.2.1)                                            |
| Adapter             | `TerraBrasilisSource` `terrabrasilis-wfs/0.3` (PRODES + DETER)            |
| Test suites         | unit 129 passed (11 files); integration 56 passed (5 files, was 50)       |
| Quality gates       | `pnpm typecheck`, `pnpm lint`, `pnpm format:check` — all green            |

## Limits and open points

- Replay does not exercise persistence (0 ms by design); use the live path or
  `validation-persistence.integration.test.ts` for storage costs.
- The live DETER layer is dynamic; a re-capture may not reproduce the base
  capture's 97 events. Replay always uses the retained capture, and re-fetching
  a mutable upstream does not reproduce an older capture (see
  `evidence-hashing.md`).
- 12 of the 97 captured events have invalid source geometry → issue
  `INVALID_EVENT_GEOMETRY` and no measurement (never a fabricated area 0).
- Coverage is `unknown` for TerraBrasilis, so `INSUFFICIENT_COVERAGE` and
  `INCONCLUSIVE` are expected in every default run.
- Timing instrumentation is the minimal set allowed in this stage — no
  dashboards or alerting.
- Manifest composition still has no endpoint; see
  `oracle-evidence-handoff-v01.md` for pendências.
