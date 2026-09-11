# Open research questions

Unresolved unless marked by a future reviewed decision. Record the rationale,
supporting observations, reviewer and affected methodology/schema version when
resolving a question. This starter intentionally supplies no scientific answers.

## Intern 2 — Environmental/GIS

- What is the authoritative role of PRODES vs DETER?
- Should DETER trigger FAIL or only a warning/revalidation?
- What field represents event time in each dataset?
- What real TerraBrasilis endpoints and PRODES/DETER layers are appropriate?
- Which WFS spatial/temporal filters, pagination, payload validation and completeness checks are needed?
- What processing CRS should be used for Mato Grosso? How are source CRS and units verified?
- What minimum intersection should be considered meaningful?
- How do we handle invalid geometries? Reject, repair, flag, or another documented behavior?
- Which geometry types, normalization, dimensionality, precision and zero-area behavior are supported?
- What is the intersection percentage denominator? How is boundary-only contact treated?
- How should overlapping events be aggregated without double-counting?
- How do we handle incomplete environmental data?
- How do we distinguish data-source failure from environmental compliance?
- What do unknown, annual or monthly event dates mean relative to the cutoff? Is the cutoff inclusive?
- How are source hierarchy, missing dates, unavailable sources, warnings and execution errors mapped to results?
- What are source coverage, licensing, update cadence and known limitations?

## Intern 1 — Blockchain/Evidence

- What exactly is canonicalized before evidence hashing?
- How are geometryHash, payloadHash and evidenceHash inputs/bytes defined independently?
- Which deterministic representation produces the same hash for semantically equal evidence?
- Which evidence fields belong on-chain? What is the minimal final attestation schema?
- Does transaction authorization make an additional validator signature redundant?
- Is the initial single admin/validator model sufficient, and how should authority change over time?
- How should Soroban TTL be maintained over multi-year certificates?
- How do Instance vs Persistent storage affect rent, throughput, restoration and record size?
- How are instance, contract code and individual attestation TTLs extended and tested?
- What happens on archival and restoration? Who pays and what is the operational responsibility?
- What are deployment, attestation, read, revoke, TTL extension and restoration costs?
- How should the off-chain adapter bind ABI types, simulate, sign, submit, confirm and recover transactions?
- Should evidence initially use S3/MinIO or IPFS?

## Joint decisions and main researcher

- What is the final EvidenceManifest schema and its compatibility/versioning policy?
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
