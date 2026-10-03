# Open decisions

Scientific approval is recorded in [JADE-ENV-0.1](../methodology/JADE-ENV-0.1.md).
The API remains INCONCLUSIVE while that methodology is draft.

## Scientific

- Define the meaning of `view_date`, `image_date`, and PRODES `year` for each class.
- Define sufficient spatial and temporal coverage: biome, clouds, publication
  delays, revisions, and minimum observable area. Decide which additional layers
  are needed for Cerrado and Pantanal.
- Approve cutoff inclusivity, date intervals, and uncertainty precedence.
- Approve topology, processing CRS, area thresholds, and numerical tolerance.
- Decide whether geometry repair is needed. It is currently disabled.

## Implementation

- Preserve source event classes in the normalized event model before implementing
  class-dependent decisions. They currently survive only in raw payloads.
- Bound the complete validation workload. The WFS timeout does not cover the
  subsequent PostGIS loop; response bytes and concurrent runs are not capped.
- Define evidence retention and recovery of runs left `running` after a crash.
- Connect the documented geometry/manifest canonicalization to manifest composition
  and Stellar. Contract TTL, restoration, and deployment remain separate work.

- What exactly is canonicalized before evidence hashing? — **resolved**: the full `EvidenceManifestV01` via RFC 8785 (JCS), see `docs/research/evidence-hashing.md`.
- How are geometryHash, payloadHash and evidenceHash inputs/bytes defined independently? — **resolved** in `docs/research/evidence-hashing.md`; coordinate precision and processing CRS remain open GIS decisions.
- Which deterministic representation produces the same hash for semantically equal evidence? — **resolved**: JCS, implemented as `jcsEvidenceCanonicalizer` (`packages/evidence/src/jcs-canonicalizer.ts`), proven order-independent by known-vector tests.
- Which evidence fields belong on-chain? What is the minimal final attestation schema? — **v0.1 field set and an initial on-chain/off-chain split are closed**, see `docs/research/evidence-manifest-v01.md`; no off-chain summary field becomes a Soroban _event_ in v0.1 — **resolved** in `docs/research/attestation-model-v01.md`.
- Does transaction authorization make an additional validator signature redundant? — **resolved for the PoC: yes**, see `docs/research/attestation-model-v01.md`.
- Is the initial single admin/validator model sufficient, and how should authority change over time?
- How should Soroban TTL be maintained over multi-year certificates? — **policy proposed** (renew on write, permissionless `extend_ttl`, periodic keeper), see `docs/research/soroban-storage-ttl.md`; fees and restore flow unverified on a network.
- How do Instance vs Persistent storage affect rent, throughput, restoration and record size?
- How are instance, contract code and individual attestation TTLs extended and tested?
- What happens on archival and restoration? Who pays and what is the operational responsibility?
- What are deployment, attestation, read, revoke, TTL extension and restoration costs?
- How should the off-chain adapter bind ABI types, simulate, sign, submit, confirm and recover transactions?
- Should evidence initially use S3/MinIO or IPFS? — the manifest now reserves an optional `evidenceUri` pointer for this (`docs/research/evidence-manifest-v01.md`); the storage backend choice itself is still open.

## Joint decisions and main researcher

- What is the final EvidenceManifest schema and its compatibility/versioning policy? — **v0.1 field set closed**, see `docs/research/evidence-manifest-v01.md`; `lotId` and a `warnings` field were evaluated and deliberately not added (see that document's "Candidate new fields" section) pending product/methodology decisions.
- What evidence must accompany incomplete/inconclusive/error outcomes?
- Which metadata proves dataset/version coverage and supports reproduction?
- When can scenarios A–D be enabled as approved methodology tests?
- What empirical evaluation supports the temporal, spatial and decision rules?
- What is the approved scope and wording of screening results?
- How should requests/results and evidence be persisted, retained and retrieved?

## Implemented engineering hypotheses, still subject to evaluation

- One admin, selected atomically in the constructor, is initially the only validator.
- Instance storage holds the admin; persistent storage holds each attestation.
- Attestation IDs and methodology-version strings have small defensive size limits.
- Per-event intersection measurements are retained without inventing aggregate areas.
- Unknown manifest measurements use null, never a fabricated zero.
- Operational HTTP failures do not automatically become environmental results.

These choices make the starter usable; they do not settle the research questions above.
