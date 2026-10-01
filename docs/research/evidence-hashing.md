# Evidence hashing and canonicalization strategy

Blockchain/Evidence research, activities 1–2. This integration contract preserves
GIS page receipts and the evidence hashing primitives. It does not approve the
scientific methodology or implement attestation/storage/TTL research (activities
3–4). The API still returns INCONCLUSIVE by default and does not build manifests.

The three SHA-256 digests are distinct. They use lowercase 64-character hex.
The manifest excludes its own `evidenceHash`; the future Stellar adapter must
explicitly convert the digest to `BytesN<32>`.

## Validation preconditions

These hashing entrypoints do not perform schema validation. Before calling
`canonicalizeEvidence`, `jcsEvidenceCanonicalizer`, or `hashEvidence`, callers
must validate external JSON against `EvidenceManifestV01Schema`, including
registered date, date-time and URI formats. Extra object fields are forbidden.
Before `hashGeometry`, validate against `GeometrySchema`. For validation inputs,
also enforce `PolygonGeometrySchema`, `isPolygonGeometry` (closed rings), and
the input position limit. TypeScript types are not runtime validation.

## `geometryHash`

SHA-256 of UTF-8 JCS (RFC 8785) JSON for the original submitted geometry.
Object keys are sorted; coordinates, ring order, holes, and components retain
their exact order and precision. No repair, reprojection, rounding, or Unicode
normalization is applied. The API accepts closed 2D Polygon/MultiPolygon in
WGS84 (EPSG:4326) longitude/latitude. Generic geometry hashing also supports
structurally valid GeoJSON such as Point; this does not broaden API acceptance.

Processing CRS and area operations are documented in
[geometry policy](geometry-crs-policy.md). Their scientific approval and any
future normalization/precision policy remain open. Hashing original geometry
must not be confused with approving processing semantics.

Implemented by `hashGeometry(geometry: Geometry)`.

## `payloadHash`

SHA-256 of **one page's bytes returned by Fetch `response.arrayBuffer()`**,
before text decoding, JSON parsing or event mapping. Fetch may already decompress
HTTP content encoding; these are response body bytes, not wire framing or headers.
Do not concatenate pages or hash mapped events. Formatting, a UTF-8 BOM, and any
byte change affect this digest. Empty pages are still retained and hashed.

The TerraBrasilis adapter captures `bodyBytes`, decodes a separate `body` string
for parsing, and archives the bytes and receipt before mapping. Event provenance
uses the corresponding page hash and `/features/N` locator. Receipt fields
(request URL/method/body, retrieval time, returned count) preserve page identity.
`SourceReport.pages` is ordered by ascending requested `startIndex`; source
reports preserve configured dataset order (default PRODES, DETER), regardless
of concurrent request completion. Do not derive order from archive filenames
or callback completion time.

A future manifest composer emits one `sources[]` entry **per page**, copying
provider, dataset, datasetVersion, layer from its report and retrievedAt and
payloadHash from its page, flattening report order then page order. Repeated
provider/dataset entries are intentional. The manifest's existing shape is
unchanged; full request receipts stay off-chain. No aggregate source digest is
introduced. `hashPayload(bytes: Uint8Array)` hashes exactly the supplied bytes.

Compatibility: older `terrabrasilis-wfs/0.2` captures hashed UTF-8 re-encoded
`response.text()`. New captures use `terrabrasilis-wfs/0.3`. Plain valid UTF-8
without a BOM has the same digest. Never relabel or recompute historical receipts;
a missing original byte sequence cannot be recovered from its old digest.
Custom/legacy `SourcePageEvidence` producers may omit `bodyBytes`; the archive
then preserves UTF-8 bytes of `body` and verifies the supplied digest. Raw-byte
claims apply only when original bytes were captured. Replay reads archive bytes
without a text round-trip and verifies the original receipt before serving them.

## `evidenceHash`

SHA-256 of UTF-8 RFC 8785 JCS JSON for the complete validated manifest, including
optional `evidenceUri`/`implementationVersion` when present. Keys are sorted by
UTF-16 code units; numbers use ECMAScript serialization. Array order is preserved,
so exchanging pages or sources changes the digest. `null`, zero and absent
optional properties remain distinct. Date strings are hashed as validated;
Unicode normalization is not applied.

`hashEvidence(manifest, jcsEvidenceCanonicalizer)` explicitly supplies the
canonicalizer; omitting it throws `ResearchNotImplementedError`. The supplied
implementation uses `canonicalize`, pinned at 5.1.0. Custom canonicalizers retain
the existing API and must define their own reproducible byte contract.

## Retention and audit

A digest proves equality to bytes provided by an auditor; it cannot reconstruct
those bytes or guarantee that an upstream service will return them again.
Preserve original input geometry, each payload, full request receipts, manifest,
and matching implementation/runtime versions off-chain. Back up the archive and
PostgreSQL together. `evidenceUri` is an optional pointer; absent/null does not
remove retention or controlled auditor-access requirements. GET validation
history currently returns metadata, not raw archive files. Retention duration,
storage backend and retrieval authorization remain operational decisions.

## Verification

Tests pin SHA-256 and JCS vectors, key-order invariance, coordinate/content
sensitivity, optional-field compatibility, null/zero distinction and array order.
Integration regression tests exercise BOM bytes, per-page receipt/archive hashes,
deterministic page order, and replay from archived bytes with no upstream fetch.
Schema tests verify commodity bounds and strict fields with format validation.
These synthetic tests do not establish scientific accuracy or live coverage.

## Open research

- Scientific approval of processing/precision and any future normalization.
- Unicode normalization of free-text fields.
- Manifest composition and publication integration.
- Attestation design, storage/TTL, restoration and costs (activities 3–4).
- Retention policy, durable backend, and controlled auditor access.
