# Initial attestation contract

This contract stores an attestation supplied by an authorized validator. It has no
environmental algorithms or geospatial/source concepts. The ABI and storage layout
are engineering hypotheses for Intern 1 to evaluate.

- `__constructor(admin)` initializes the admin atomically and requires its authorization.
- `attest(validation_id, evidence_hash, methodology_version, result, validator)`
  only accepts that admin as validator and requires Soroban authorization for the
  full invocation. Duplicate IDs, including revoked IDs, cannot be overwritten.
- `get_attestation(validation_id)` reads the record or returns `None` for an absent key.
- `revoke(validation_id)` requires the stored admin's authorization and retains the
  original hash and result. Repeating a revocation is harmless; unknown IDs error.

The result variants are `Pass`, `Fail`, `Inconclusive`, `Error`; lifecycle status is
`Active` or `Revoked`. The hash is `BytesN<32>`. Initial ID/methodology string limits
are 128/64 bytes. There is no key rotation, multi-validator system or upgrade flow.

## Storage and lifecycle TODOs

Hypothesis: instance storage for the admin; one persistent entry per attestation.
No TTL extension is performed. This is not a solved certificate lifecycle.

TODO(intern-blockchain):

- Evaluate Instance vs Persistent storage.
- Evaluate TTL for instance, code and individual attestations.
- Test TTL extension.
- Test archival.
- Test restoration and whether reads/mutations need client-side restoration.
- Estimate transaction and long-term maintenance costs.
- Confirm overwrite protection and revocation behavior across restoration.

The ignored `ttl_lifecycle_research` test will deliberately fail if enabled before
its research implementation. Active authorization tests verify recorded auth trees
and reject both an outsider address and an unsigned claim to the admin identity.

## Tooling

Rust 1.91+ is required by pinned Soroban SDK 27.0.6. Use a Rust toolchain that
supports the committed Cargo lockfile. Native tests do not require Stellar CLI:

```bash
cargo test --workspace
cargo fmt --check
rustup target add wasm32v1-none
cargo build --release --target wasm32v1-none -p jade-attestation
```

Wasm output: `target/wasm32v1-none/release/jade_attestation.wasm`.

For later network experiments, install the official Stellar CLI and confirm SDK,
CLI and network protocol compatibility. Funding identities, deployment and binding
generation are separate activities; no accounts, keys or transactions are created
by this repository's startup scripts.

The SDK macro generates `Self::Error` conversion types that clash with the requested
`ValidationResult::Error` variant under this Rust compiler. A documented
`ambiguous_associated_items` lint allowance preserves the required ABI until the
upstream macro qualifies that associated type. It does not disable authorization
or contract errors.

[Official Soroban SDK](https://docs.rs/soroban-sdk/27.0.6/soroban_sdk/)
and [Stellar CLI](https://developers.stellar.org/docs/tools/cli/stellar-cli).
