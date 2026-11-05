# Research

These documents describe the implemented prototype and the evidence behind its
current assumptions:

- [Source profiles](environmental-sources-v01.md): WFS layers, attributes, dates,
  pagination, and coverage limits.
- [Geometry policy](geometry-crs-policy.md): CRS, intersection and area calculations,
  and measured differences between projections.
- [Request contract](validation-input-v01.md): accepted geometry, fields, and limits.
- [Open decisions](open-questions.md): unresolved scientific and operational work.
- [Methodology](../methodology/JADE-ENV-0.1.md): decision table and approval status.
- [Evidence manifest v0.1](evidence-manifest-v01.md): field-by-field review of what
  must be preserved for audit, and the on-chain/off-chain split.
- [Evidence hashing](evidence-hashing.md): `geometryHash`, `payloadHash` and
  `evidenceHash` byte contracts (JCS/SHA-256).
- [Oracle → Evidence handoff v0.1](oracle-evidence-handoff-v01.md): mapping from
  API `ValidationResult` to `EvidenceManifestV01`, with a verified fixture.
- [Geospatial PoC week 01](geospatial-poc-week-01.md): capture/replay consolidation,
  controlled decision cases, and performance measurements.

## Running experiments

`pnpm research:sources`, `pnpm research:geometry`, and `pnpm test:live` write new
captures under the ignored `.data/research/` directory. Each accepts an explicit
output path as its first argument. Raw responses and generated results stay local;
unit tests use small synthetic inputs defined in test code.

To capture and replay a validation with local PostGIS:

```bash
pnpm test:live .data/research/api-sinop
pnpm test:replay .data/research/api-sinop
```

The live command queries WFS; replay reads the supplied capture directory and
verifies payload hashes without querying WFS.
