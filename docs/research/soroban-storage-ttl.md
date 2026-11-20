# Soroban storage and TTL for attestations

Estagiário 1 (Blockchain/Evidence), etapa 16–30 Set — Atividade 4.

## Question this closes

> Where does an attestation live, how is it kept alive for years, when is it renewed,
> and how is archived state recovered?

Scope: `contracts/jade-attestation`, soroban-sdk 27.0.6 (soroban-env-host 27.0.1).
Experiments are native tests in `contracts/jade-attestation/src/test.rs`. Network figures
(fees, limits) are **not** measured here; see "Limits of this evidence".

## Storage types

| Type       | Lifetime at expiry                           | Recoverable            | Fit                                       |
| ---------- | -------------------------------------------- | ---------------------- | ----------------------------------------- |
| Temporary  | **deleted**                                  | no                     | scratch data only; never certificates     |
| Persistent | **archived** (no longer live, not destroyed) | yes, by a restore step | one entry per attestation                 |
| Instance   | archived together with the contract instance | yes, by a restore step | small shared config (the `Admin` address) |

Decision: **Persistent, one entry per `validation_id`**, and **Instance for the admin only**.
A shared Instance map of attestations is rejected: Instance is loaded in full on every
invocation, grows without bound, and one oversized entry would make the whole contract
costlier and eventually unusable. Per-entry Persistent storage keeps every call's cost
independent of how many certificates exist. Temporary is rejected outright: expiry
deletes the entry, which would silently destroy a certificate and allow its ID to be
reissued.

## Experiments (all pass in `cargo test -p jade-attestation`)

| Test                                                                   | Finding                                                                                                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ttl_defaults_and_decay`                                               | Defaults: `min_persistent_entry_ttl` 4096, `min_temp_entry_ttl` 16, `max_entry_ttl` 6,312,000 ledgers. A new entry has TTL 4095 and loses one per ledger. |
| `temporary_entries_expire_but_persistent_attestations_remain_readable` | A Temporary entry is gone after its TTL; the Persistent attestation is still readable.                                                                    |
| `extend_ttl_respects_threshold`                                        | `extend_ttl(key, threshold, extend_to)` does nothing while remaining TTL is above `threshold`; otherwise it sets TTL to `extend_to`.                      |
| `writes_renew_ttl_and_extend_ttl_is_permissionless`                    | `attest`/`revoke` renew to the target, and `extend_ttl` renews with **no authorization**, for the attestation and the instance.                           |
| `expired_persistent_attestation_cannot_be_overwritten_in_test_host`    | After expiry the entry is still found, so `attest` returns `AlreadyExists`.                                                                               |

Defaults of 4096 ledgers are about 5.7 hours at roughly 5 s per ledger. Without renewal a
certificate would reach archival in hours, so a TTL policy is mandatory, not optional.

## Policy

**Where:** Persistent entry per attestation; Instance for the admin.

**Keeping alive.** Constants in `lib.rs`: threshold 30 days (518,400 ledgers), target
365 days (6,307,200 ledgers), just under `max_entry_ttl` (about 365 days). The private
`keep_alive` helper extends the attestation _and_ the instance, and runs in `attest` and
`revoke`. A new public `extend_ttl(validation_id)` lets anyone prepay rent: it changes no
data, needs no auth, and fails with `NotFound` for an absent key. `get_attestation`
stays a pure read; extending inside a getter would turn every query into a paid
write.

**When to renew.** A scheduled job (off-chain, not yet built) calls `extend_ttl` for
every active attestation, targeting a renewal every 90 days. Because the cap is about one
year, a record is never more than one year from archival, so the 30-day threshold plus
a 90-day cadence leaves several missed runs of slack. Revoked attestations must also be
renewed: a revoked ID that disappears could be reissued. The Wasm code entry has its own
TTL and must be extended by the operator (Stellar CLI) on the same schedule.

**Recovering archived state.** An archived entry is not deleted. The client must submit
a restore transaction for the entry (and, if it lapsed, the contract instance and code)
before reading or writing it, typically using the restore preamble that simulation
returns. After restoration the original bytes are intact, so the overwrite protection
holds: `attest` finds the key and returns `AlreadyExists`. The runbook is: simulate; if a
restore is requested, submit it and pay; resubmit the call; then run `extend_ttl`. The
off-chain adapter (`packages/stellar`) must implement this; it is not built.

## Cost and long-term impact

Rent is charged per entry, per ledger of TTL, scaled by entry size. Estimated size of an
attestation, worst case: ID up to 128 bytes, methodology up to 64, hash 32, address
about 32, plus enums and XDR overhead: **roughly 300 bytes**. Keeping N certificates for
Y years needs about N x Y renewals at the one-year cap, so maintenance cost grows
linearly in N and Y and is independent of read traffic. Per-entry rent, restore fees
and deployment cost **were not measured**; they depend on live network settings and must
be obtained from a simulation on testnet before any budget is quoted.

Two further consequences of multi-year retention: renewal needs an always-funded account
and an operating owner; and archival hits state nobody queried, so the first user after a
lapse pays for the restore.

## Limits of this evidence

- The native test host **does not model archival**. Entries past their TTL stay readable
  (the persistent TTL even reads as renewed after a jump beyond expiry), so the restore
  flow, restore fees and the post-restore overwrite check are **untested here**. Only
  Temporary deletion is reproduced.
- No fees were measured; the size and cost statements above are estimates.
- Archival semantics follow the Stellar documentation for the protocol in use and must
  be re-checked against the target network (testnet) and the Stellar CLI version.

## Open questions

- Who owns renewal and restore operationally, and who pays?
- Exact restore/rent fees on testnet for a ~300-byte entry.
- Should the instance and code TTLs be extended by a keeper job or by users?
- Is a 365-day cap acceptable for certificates meant to last longer, given that renewal
  is mandatory by design?
