# Attestation model v0.1 — minimal on-chain record and authentication

Estagiário 1 (Blockchain/Evidence), etapa 16–30 Set — Atividade 3.

## Question this closes

> What must the contract actually keep, who may write it, and what does Soroban
> authorization prove — is an extra stored signature needed for the PoC?

Priority: simplicity. No DID, Verifiable Credentials, SBT, Merkle tree or multisig.
Scope: `contracts/jade-attestation` (soroban-sdk 27.0.6). Storage lifecycle and TTL
are covered in `docs/research/soroban-storage-ttl.md` (Atividade 4).

## Current record

```text
Attestation { validation_id, evidence_hash, methodology_version, result, validator, status }
key:  DataKey::Attestation(validation_id)   (Persistent storage, one entry each)
```

## Field-by-field review

| Field                 | Storage | Event | Redundant                                   | Must not be public | Decision                                                                                                   |
| --------------------- | ------- | ----- | ------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `validation_id`       | key     | topic | **Yes** in the value (it is the key)        | no                 | Keep in the value for v0.1: costs <=128 bytes, keeps `get_attestation` self-describing. Revisit before v1. |
| `evidence_hash`       | **yes** | no    | no                                          | no (hash only)     | Core of the record. Covers geometry, sources and analysis transitively.                                    |
| `methodology_version` | **yes** | no    | no                                          | no                 | Keep: a verifier must know which rules produced `result` without off-chain lookups.                        |
| `result`              | **yes** | no    | no                                          | no                 | Keep: the verifiable outcome.                                                                              |
| `validator`           | yes     | yes   | **Today** (always equals the admin)         | no                 | Keep for forward compatibility with more validators; the `Attested` event already carries it.              |
| `status`              | **yes** | no    | partly (the `Revoked` event repeats a flip) | no                 | Keep in storage: a reader must not replay events to know the current state. The event is an audit trail.   |

Summary:

- **Strictly required in storage:** `evidence_hash`, `methodology_version`, `result`, `status`.
- **Redundant now, kept on purpose:** `validation_id` (key) and `validator` (single admin).
  Removing them would change the ABI/bindings for a few dozen bytes; not justified for the PoC.
- **Event, not storage:** `Attested` (`validation_id` topic, `validator`) and `Revoked`
  already exist. No further manifest field is promoted to an event. Candidate for later:
  adding `evidence_hash` to `Attested` so indexers need not read storage. Not done: no
  consumer exists yet.
- **Never on-chain (public ledger):** geometry (and `geometryHash` alone, which can confirm
  a guessed boundary), `sources[]`, `commodity`, `analysis.*`, `evidenceUri`, any
  business or personal data. All stay off-chain and are bound only through `evidence_hash`
  (`docs/research/evidence-hashing.md`).

Resolves the open point left by `docs/research/evidence-manifest-v01.md`: **no off-chain
summary field (e.g. `analysis.intersectionAreaM2`) becomes an event in v0.1.**

## Authentication model

- **`admin`** is set once in `__constructor(admin)`, which requires its authorization,
  and is kept in Instance storage. There is no rotation or transfer.
- **`validator`** is the address passed to `attest`. The contract accepts only
  `validator == admin`, then calls `validator.require_auth()`. In v0.1 the validator
  therefore _is_ the admin.
- **`revoke`** requires the stored admin's authorization, independent of who attested.

### What `require_auth()` proves

It proves the holder of the address's key (or the contract logic of a custom-account
address) authorized **this exact invocation**: contract, function and arguments, covered
by the signed authorization entries and bound to the network and a nonce, so it cannot be
replayed or reused for different arguments. The recorded auth tree is asserted in
`authorized_attestation_succeeds` and `attestation_can_be_revoked`.

It does **not** prove that the evidence is true, that the methodology was run correctly,
or that the key was not compromised. The contract does not validate source truth
(`docs/architecture/environmental-flow.md`).

### Is an extra stored signature needed?

**No, for the PoC.** The transaction authorization already binds the validator to the
full argument list, including `evidence_hash`, and the ledger keeps the transaction
history. A signature stored in the record would duplicate that proof and add bytes and
key-format questions. It would become relevant only if a third party must verify the
attestation without access to ledger history, which is outside this scope.

## Test review

All ten original tests were run (`cargo test --workspace`: pass) and mapped to the brief:

| Requirement           | Test                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- |
| authorized issuance   | `authorized_attestation_succeeds` (auth tree and `Attested` event)                        |
| unauthorized issuance | `unauthorized_validator_is_rejected`                                                      |
| missing authorization | `claiming_admin_without_authorization_is_rejected`, `revoke_requires_admin_authorization` |
| query                 | `attestation_can_be_retrieved`, `missing_attestation_is_explicit`                         |
| revocation            | `attestation_can_be_revoked`, `revoked_status_can_be_read_and_cannot_be_replaced`         |
| overwrite attempt     | `attestation_cannot_be_overwritten`, plus the revoked case above                          |
| input bounds          | `empty_identifier_is_rejected`                                                            |

No gap required a new authorization test. Atividade 4 added TTL tests (see that document).

## Contract changes

None to the `Attestation` struct, the errors or the events. The only change in this
branch is the TTL renewal in Atividade 4, which does not alter the record layout.

## Remaining risks and open questions

- Single admin key: compromise allows forged attestations and revocations; no rotation.
  Rotation or multi-validator is deliberately out of scope until the core is validated.
- Revocation is irreversible and an ID can never be reissued, including after revocation.
  A corrected result needs a new `validation_id`.
- The `validator` field is redundant until a second validator exists.
- No upper bound is enforced on the hash semantics: `evidence_hash` is any 32 bytes; the
  link to `hashEvidence` is by convention (`@jade/evidence`) and verified off-chain.
