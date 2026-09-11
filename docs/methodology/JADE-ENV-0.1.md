# JADE-ENV-0.1 — methodology template

Status: **DRAFT TEMPLATE — not approved and not implemented.**
Owner: main researcher, with Intern 2; evidence sections jointly with Intern 1.

## Purpose

Define a reproducible environmental origin screening method whose inputs, source
observations and result can be represented by a shared evidence manifest.

## Scope

Environmental/geospatial screening within the JADE-MT research prototype.
PASS is an environmental screening status, not a claim of full EUDR compliance.
TODO — research decision required: geographic, commodity and dataset coverage,
eligibility and intended interpretation of each outcome.

## Input

Structurally known: GeoJSON geometry, commodity, cutoff calendar date. API requests
are validated using `ValidationInputSchema`. An orchestration-generated UUID
identifies a validation. Geometry topology and scientific suitability are not
established by JSON shape validation.

TODO — research decision required: supported geometry types, coordinate semantics,
required provenance, size constraints, and input data quality criteria.

## Environmental sources

Sources implement `EnvironmentalSource` and return `EnvironmentalEvent[]`.
PRODES, DETER and MapBiomas are possible implementations of the same abstraction.

TODO — research decision required: authoritative roles, real endpoints/layers,
temporal attributes, payload mappings, versions, licensing, WFS filters, paging,
spatial and temporal coverage, completeness, update cadence and limitations.

## Geometry normalization

Node orchestrates; PostGIS performs geospatial computation.

TODO — research decision required: validation versus repair, normalization,
ring closure/orientation, multipart/empty geometries, dimensionality and precision.

## CRS

TODO — research decision required: source CRS interpretation and processing CRS
for Mato Grosso; units, transformations, distortion and reproducibility checks.
No processing SRID is selected in the implementation.

## Temporal rule

The input uses a calendar date. Event values retain their source precision, which
may be day, month, year or unknown; an event may have no date.

TODO — research decision required: meaning of each source's temporal field, cutoff
inclusivity, time zones, event without date, annual observations and mixed precision.

## Spatial rule

The repository boundary exposes intersection existence, area in square metres and
percentage. These outputs have no implementation until their semantics are defined.

TODO — research decision required: meaningful minimum intersection, boundary contact,
precision, percentage denominator, zero-area inputs and overlapping-event aggregation.

## Decision rule

Available status vocabulary: PASS, FAIL, INCONCLUSIVE, ERROR.

TODO — research decision required: JADE-ENV-0.1 mapping from spatial/temporal inputs,
source roles and availability to outcomes. The four skipped synthetic scenarios
are initial hypotheses, not adopted rules. Distinguish incomplete data, unavailable
sources and execution errors from environmental findings.

## Evidence generation

Structurally known: a versioned manifest bridges environmental processing and
attestation; SHA-256 hashes bytes selected by an explicit canonicalization strategy.

TODO — research decision required: exact manifest content, provenance, input/source
hash representations, canonicalization, completeness proofs, evidence storage,
retrieval and verification. Evaluate any final on-chain subset jointly.

## Known limitations

No live source mapping, geospatial processing policy or decision methodology is
implemented. No canonicalization, evidence storage, Stellar submission or long-term
TTL strategy is implemented. Synthetic unit tests do not validate scientific accuracy.

TODO — research decision required: empirical source limitations, false positive/
negative behavior, uncertainty, precision and applicability of eventual results.

## Versioning

Current structural identifiers: methodology `JADE-ENV` / `0.1`, manifest
`jade-evidence/0.1`. They label draft integration contracts.

TODO — research decision required: approval and release criteria, version changes,
dataset/version pinning, migration, comparison and reproducibility requirements.
