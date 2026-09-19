# Evidence hashing and canonicalization strategy

Estagiário 1 (Blockchain/Evidence), etapa 16–30 Set — Atividade 2.

Builds on `docs/research/evidence-manifest-v01.md` (the `EvidenceManifestV01`
field set is closed). This document defines the exact bytes behind each of
the three distinct SHA-256 hashes the system uses, and implements them.

> **These hashes are distinct and must never substitute for one another.**
> The manifest does not contain its own `evidenceHash` — it is computed
> externally by `hashEvidence` and only the resulting digest is submitted
> on-chain as `evidence_hash`.

## Scope boundary

CRS, geometry normalization, coordinate precision, ring closure/orientation,
and WFS payload → `EnvironmentalEvent` mapping are explicitly the GIS
intern's open research questions (`packages/database/src/postgis-geometry-repository.ts`,
`TODO(intern-gis)`; `docs/methodology/JADE-ENV-0.1.md`, "Geometry
normalization" and "CRS" sections, both still TODO). This activity does not
decide those semantics — it defines how to hash what already exists
(structurally-validated geometry, raw fetched bytes), and records the
GIS-owned gaps as open questions below rather than as a blocker.

## `geometryHash`

| Question                 | Answer                                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which geometry is hashed | `ValidationInput.geometry` exactly as submitted, after passing `GeometrySchema` structural validation (`packages/schemas/src/geometry.ts`)                                                                                                                                |
| Original or normalized   | **Original.** No normalization is implemented anywhere in the repo today; deciding one now would preempt the GIS methodology's own open decision.                                                                                                                         |
| Representation           | Canonical JSON (JCS, RFC 8785 — same strategy as `evidenceHash`, see below) of the GeoJSON geometry object                                                                                                                                                                |
| CRS                      | GeoJSON (RFC 7946) implies WGS84 when no `crs` member is present, and the schema has no `crs` field — this fixes the CRS of the _hashed representation_ unambiguously. The _processing_ CRS used by PostGIS intersection analysis is a separate, still-open GIS question. |
| Encoding                 | UTF-8 bytes of the canonical JSON text                                                                                                                                                                                                                                    |
| Precision                | Coordinates are hashed exactly as received, with no rounding. A coordinate-precision policy is a GIS decision, not made here.                                                                                                                                             |

Implemented in `packages/evidence/src/hash-geometry.ts` as
`hashGeometry(geometry: Geometry): string`.

## `payloadHash`

| Question                    | Answer                                                                                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which payload               | The raw bytes of one retrieved source response, one hash per `sources[]` entry — not an aggregate across sources                                                                                                                                                |
| Pagination                  | Pages are concatenated as raw bytes in the exact order they were requested/received; never reordered or merged as JSON                                                                                                                                          |
| Page order                  | Fetch order (e.g. ascending `startIndex`/page number used in the WFS request)                                                                                                                                                                                   |
| Raw vs. transformed         | **Raw.** The response body bytes are hashed before any parsing or mapping to `EnvironmentalEvent`. Mapping logic can have bugs; the point of `payloadHash` is independent re-verification against the original source, which a transformed hash cannot provide. |
| What stays outside the hash | HTTP headers, retry/timing metadata, and the manifest's own `provider`/`dataset`/`retrievedAt`/etc. fields (those are covered by `evidenceHash` via the manifest, not by `payloadHash`)                                                                         |

Implemented in `packages/evidence/src/hash-payload.ts` as
`hashPayload(bytes: Uint8Array): string` — a direct SHA-256 of the given
bytes, deliberately without canonicalization, since transforming raw bytes
before hashing would defeat the point above.

## `evidenceHash`

| Question                  | Answer                                                                                                                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which object              | The complete `EvidenceManifestV01`, all schema-defined fields (including `evidenceUri`/`implementationVersion` from Atividade 1)                                                                                                                                 |
| Which fields              | All of them — `additionalProperties: false` on every object in the schema already guarantees a closed set, so validating against the schema before hashing is sufficient                                                                                         |
| Canonicalization standard | **JSON Canonicalization Scheme — RFC 8785 (JCS)**, not an implicit `JSON.stringify()`                                                                                                                                                                            |
| Property order            | JCS sorts object keys by UTF-16 code unit — deterministic regardless of the source object's insertion order                                                                                                                                                      |
| Numbers                   | ECMAScript `Number::toString`, the same algorithm `JSON.stringify` uses in JS engines. Safe here because every numeric field is already schema-validated (`Type.Number`/`Type.Integer` with `minimum`/`maximum`) before hashing — `NaN`/`Infinity` cannot occur. |
| Lists                     | **Not reordered** — JCS only sorts object keys, never array elements. `sources[]` keeps its original order, which is semantically meaningful (retrieval order).                                                                                                  |
| `null`                    | Preserved as-is. This matters because the schema deliberately uses `null` for "not measured" (e.g. `analysis.intersectionAreaM2`); it must stay distinguishable from a real value in the hash.                                                                   |
| Dates                     | Hashed as the plain ISO-8601 strings the schema already validates (`cutoffDate`, `retrievedAt`) — no extra date canonicalization invented.                                                                                                                       |
| Unicode                   | Canonical text is UTF-8 before hashing (JCS's own requirement). Unicode normalization (NFC/NFKC) of free-text fields like `input.commodity` is not applied — recorded as a low-risk open question, not a blocker.                                                |

**Why JCS specifically**: it is a formal standard with implementations in
multiple languages, so a third-party auditor — or a future Rust/Soroban-side
verifier — can reproduce the same hash without depending on this Node
codebase's internal object key insertion order. This directly avoids the
"don't just apply `JSON.stringify()` implicitly" requirement.

Implemented in `packages/evidence/src/jcs-canonicalizer.ts`, exporting
`jcsEvidenceCanonicalizer: EvidenceCanonicalizer`, built on the
[`canonicalize`](https://github.com/erdtman/canonicalize) package (RFC 8785
reference implementation, zero dependencies, pinned exact version
`5.1.0` in `packages/evidence/package.json`). It is passed explicitly by
callers — `hashEvidence(manifest, jcsEvidenceCanonicalizer)` — preserving
`canonicalizeEvidence`'s original design ("no implicit fallback").

## Known vectors and proofs

All in `packages/evidence/src/`:

- `jcs-canonicalizer.test.ts` — pins the canonical JSON bytes for a full
  example manifest; proves that rebuilding the same manifest with every
  object's keys inserted in reverse order produces **identical** bytes;
  proves that changing `result` produces **different** bytes; proves array
  order is preserved (source order swap changes the hash) and that `null`
  stays distinguishable from `0`.
- `hash-geometry.test.ts` — known vector for a `Point` geometry; proves key
  order doesn't matter and coordinate changes do.
- `hash-payload.test.ts` — standard SHA-256 known-answer vectors
  (`sha256('')`, `sha256('abc')`) applied to raw bytes; proves whitespace/
  formatting changes the hash (no transformation is applied) and that page
  concatenation order matters.
- `hash-evidence.test.ts` — end-to-end: a full manifest hashed through
  `hashEvidence(manifest, jcsEvidenceCanonicalizer)` against a pinned SHA-256
  digest.

## Open questions carried forward

- Coordinate precision/rounding policy for `geometryHash` — GIS decision.
- Processing CRS for PostGIS intersection analysis (distinct from the fixed
  WGS84 assumption used for hashing) — GIS decision,
  `docs/research/open-questions.md`.
- Unicode normalization (NFC/NFKC) of free-text manifest fields such as
  `input.commodity` — low risk, not addressed here.
- Real WFS pagination/mapping implementation in
  `packages/environmental-oracle/src/sources/terrabrasilis.source.ts` still
  throws `ResearchNotImplementedError` — this activity only defines and
  implements the hashing primitives (`hashGeometry`, `hashPayload`,
  `jcsEvidenceCanonicalizer`) that the future manifest-composition layer will
  call once fetching/mapping exists.
