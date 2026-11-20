# Oracle → Evidence handoff v0.1

Estagiário 2 (GIS / Oráculo Ambiental), semana 05–09 Out — entrega de
consolidação.

## Question this closes

> Given a validation produced and persisted by the API, which oracle outputs
> map one-to-one into `EvidenceManifestV01`, which are deliberately different,
> and what is still pending before a manifest can be composed?

This is the GIS side of the handoff. The field-by-field justification for
keeping or adding each manifest field lives in
[evidence-manifest-v01.md](evidence-manifest-v01.md); the byte contracts for
`geometryHash`, `payloadHash` and `evidenceHash` live in
[evidence-hashing.md](evidence-hashing.md). This document does not change
either.

## Status

Mapping proposal plus a versioned, hash-verified fixture. The API does **not**
compose or serve manifests — no endpoint exists and none was added in this
stage. The production API continues to return `INCONCLUSIVE`
(`methodologyStatus: 'draft'`); `PASS`/`FAIL` appear only through the
controlled `evaluateDecisionProposal` injection in integration tests.

## Field mapping: `ValidationResult` → `EvidenceManifestV01`

| Manifest field                    | Origin                                                                                       | Pending                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `schema`                          | hardcoded `'jade-evidence/0.1'` (`EvidenceManifestV01Schema`)                                | versioning policy when v0.2 exists                                                       |
| `validationId`                    | `result.validationId` (API-generated uuid)                                                   | none                                                                                     |
| `methodology.id` / `.version`     | `result.methodology` (`JADE-ENV` / `0.1`)                                                    | scientific approval of JADE-ENV-0.1 (draft)                                              |
| `input.geometryHash`              | `hashGeometry()` over the **original submitted** geometry bytes (`@jade/evidence`)           | none — byte contract already fixed in `evidence-hashing.md`                              |
| `input.commodity`                 | request input, unchanged                                                                     | none                                                                                     |
| `input.cutoffDate`                | request input, unchanged                                                                     | cutoff inclusivity is still an open scientific decision                                  |
| `sources[].provider`              | `result.sources[]` flattened in report order, then page order                                | none                                                                                     |
| `sources[].dataset`               | same                                                                                         | none                                                                                     |
| `sources[].datasetVersion`        | same; `null` when the adapter does not version the dataset                                   | none                                                                                     |
| `sources[].layer`                 | same; `null` when the dataset has no layer concept                                           | none                                                                                     |
| `sources[].retrievedAt`           | each `SourceReport.pages[].retrievedAt` receipt                                              | one manifest entry **per page**, repeated provider/dataset entries are intentional       |
| `sources[].payloadHash`           | each `SourceReport.pages[].payloadHash` (SHA-256 of raw response bytes, pre-decoding)        | never recomputed from parsed/reformatted JSON — PR #30 invariant                         |
| `analysis.intersectionAreaM2`     | aggregate → **`null`** while no aggregation policy is approved                               | per-event areas stay in `result.eventAnalyses`; summing overlapping events is forbidden  |
| `analysis.intersectionPercentage` | aggregate → **`null`**, same rule                                                            | same                                                                                     |
| `analysis.eventsFound`            | `result.eventsFound`                                                                         | none                                                                                     |
| `result`                          | `result.status` — the fixture pins `INCONCLUSIVE`                                            | enabling `PASS`/`FAIL` requires the approved methodology, never request/env flags        |
| `evidenceUri`                     | optional; not composed (no storage backend yet)                                              | S3/MinIO vs IPFS — `open-questions.md`                                                   |
| `implementationVersion`           | optional; at runtime `processingVersion()` fingerprint of API + schemas/database/oracle code | omitted from the fixture (fingerprint changes with code; fixture must stay reproducible) |

### Rules this mapping preserves

1. **Aggregates are null, never fabricated.** Unknown or unapproved
   measurements use `null`, never a fabricated zero or a sum of overlapping
   event areas (`open-questions.md`, engineering hypotheses).
2. **Hashes are over raw bytes.** `payloadHash` covers the exact response
   bytes before any decoding; parsing or round-tripping JSON to "recompute"
   a hash is a contract violation.
3. **No temporal relabeling.** Capture dates (`view_date`, `image_date`,
   PRODES `year`) are never reclassified as exact occurrence dates to force a
   result.
4. **Per-event detail is not lost.** The manifest carries only the approved
   aggregates; the full per-event analyses and issues remain in the persisted
   `ValidationResult` (retrievable via `GET /validations/:id`).

## Versioned fixture

`docs/examples/evidence-handoff/` (small, synthetic, committed):

| File                     | Contents                                                                       |
| ------------------------ | ------------------------------------------------------------------------------ |
| `validation-input.json`  | controlled polygon, `commodity: 'soy'`, `cutoffDate: '2020-12-31'`             |
| `source-page.json`       | synthetic source payload bytes (not a TerraBrasilis capture)                   |
| `validation-result.json` | API-shaped result: one source, one page receipt, one event, real PostGIS areas |
| `evidence-manifest.json` | composed manifest for that input/result; aggregate areas `null`                |

Verified properties (reproducible from the committed bytes):

- manifest validates against `EvidenceManifestV01Schema` (formats registered);
- `input.geometryHash` = `hashGeometry(validation-input.json.geometry)` =
  `ebcd07f9eaf6c953dee08c6ad83396988003005baee5ab27f39f01dd431ea38d`;
- `sources[0].payloadHash` = `hashPayload(source-page.json bytes)` =
  `ba43705b8d079575713d7d78127d12b8cf1a16fd9479195fab1f34529def8102`;
- `evidenceHash` (JCS + SHA-256 of the whole manifest) =
  `713c02b65cf4419fd6805621a0b5020c50c439e1e14c33e5c9698305aba0d97c`;
- per-event areas in `validation-result.json`
  (`482056087.5399208` m², 100 %) were measured by PostGIS
  `ST_Area(ST_Intersection(...)::geography)` for the identical polygons —
  while the manifest aggregates stay `null`.

## What remains pending

- Manifest composition and publication (endpoint or batch job) — explicitly
  out of scope for this stage; contract/attestation work stays with the
  Blockchain line (activities 3–4).
- Storage backend for `evidenceUri` (`open-questions.md`).
- Enabling `PASS`/`FAIL` in the production path requires the approved
  JADE-ENV methodology, not feature flags.
- Retention and auditor access for the payloads these hashes point to.
