extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{
        storage::{Instance as _, Persistent as _, Temporary as _},
        Address as _, AuthorizedFunction, AuthorizedInvocation, EnvTestConfig, Events as _,
        Ledger as _,
    },
    Event, IntoVal,
};

fn setup() -> (Env, Address, Address, String) {
    let env = Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
        ..Default::default()
    });
    let admin = Address::generate(&env);
    let contract_id = env.register(JadeAttestation, (admin.clone(),));
    let id = String::from_str(&env, "validation-001");
    (env, admin, contract_id, id)
}

fn attest(env: &Env, contract: &Address, validator: &Address, id: &String) {
    JadeAttestationClient::new(env, contract).attest(
        id,
        &BytesN::from_array(env, &[7; 32]),
        &String::from_str(env, "0.1"),
        &ValidationResult::Inconclusive,
        validator,
    );
}

#[test]
fn authorized_attestation_succeeds() {
    let (env, admin, contract, id) = setup();
    env.mock_all_auths();
    attest(&env, &contract, &admin, &id);
    assert_eq!(
        env.auths(),
        std::vec![(
            admin.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    contract.clone(),
                    soroban_sdk::Symbol::new(&env, "attest"),
                    (
                        id.clone(),
                        BytesN::from_array(&env, &[7; 32]),
                        String::from_str(&env, "0.1"),
                        ValidationResult::Inconclusive,
                        admin.clone()
                    )
                        .into_val(&env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
    assert_eq!(
        env.events().all(),
        std::vec![Attested {
            validation_id: id,
            validator: admin,
        }
        .to_xdr(&env, &contract)]
    );
}

#[test]
fn unauthorized_validator_is_rejected() {
    let (env, _, contract, id) = setup();
    env.mock_all_auths();
    let client = JadeAttestationClient::new(&env, &contract);
    assert_eq!(
        client.try_attest(
            &id,
            &BytesN::from_array(&env, &[7; 32]),
            &String::from_str(&env, "0.1"),
            &ValidationResult::Inconclusive,
            &Address::generate(&env),
        ),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(client.get_attestation(&id), None);
}

#[test]
fn claiming_admin_without_authorization_is_rejected() {
    let (env, admin, contract, id) = setup();
    let client = JadeAttestationClient::new(&env, &contract);
    assert!(client
        .try_attest(
            &id,
            &BytesN::from_array(&env, &[7; 32]),
            &String::from_str(&env, "0.1"),
            &ValidationResult::Inconclusive,
            &admin,
        )
        .is_err());
    assert_eq!(client.get_attestation(&id), None);
}

#[test]
fn attestation_can_be_retrieved() {
    let (env, admin, contract, id) = setup();
    env.mock_all_auths();
    attest(&env, &contract, &admin, &id);
    assert_eq!(
        JadeAttestationClient::new(&env, &contract).get_attestation(&id),
        Some(Attestation {
            validation_id: id,
            evidence_hash: BytesN::from_array(&env, &[7; 32]),
            methodology_version: String::from_str(&env, "0.1"),
            result: ValidationResult::Inconclusive,
            validator: admin,
            status: AttestationStatus::Active,
        })
    );
}

#[test]
fn attestation_cannot_be_overwritten() {
    let (env, admin, contract, id) = setup();
    env.mock_all_auths();
    attest(&env, &contract, &admin, &id);
    let client = JadeAttestationClient::new(&env, &contract);
    assert_eq!(
        client.try_attest(
            &id,
            &BytesN::from_array(&env, &[8; 32]),
            &String::from_str(&env, "0.2"),
            &ValidationResult::Fail,
            &admin,
        ),
        Err(Ok(Error::AlreadyExists))
    );
    assert_eq!(
        client.get_attestation(&id).unwrap().evidence_hash,
        BytesN::from_array(&env, &[7; 32])
    );
}

#[test]
fn attestation_can_be_revoked() {
    let (env, admin, contract, id) = setup();
    env.mock_all_auths();
    attest(&env, &contract, &admin, &id);
    JadeAttestationClient::new(&env, &contract).revoke(&id);
    assert_eq!(
        env.auths(),
        std::vec![(
            admin,
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    contract.clone(),
                    soroban_sdk::Symbol::new(&env, "revoke"),
                    (id.clone(),).into_val(&env)
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
    assert_eq!(
        env.events().all(),
        std::vec![Revoked { validation_id: id }.to_xdr(&env, &contract)]
    );
}

#[test]
fn revoked_status_can_be_read_and_cannot_be_replaced() {
    let (env, admin, contract, id) = setup();
    env.mock_all_auths();
    attest(&env, &contract, &admin, &id);
    let client = JadeAttestationClient::new(&env, &contract);
    client.revoke(&id);
    client.revoke(&id);
    let revoked = client.get_attestation(&id).unwrap();
    assert_eq!(revoked.status, AttestationStatus::Revoked);
    assert_eq!(revoked.evidence_hash, BytesN::from_array(&env, &[7; 32]));
    assert_eq!(
        client.try_attest(
            &id,
            &revoked.evidence_hash,
            &revoked.methodology_version,
            &revoked.result,
            &admin
        ),
        Err(Ok(Error::AlreadyExists))
    );
}

#[test]
fn revoke_requires_admin_authorization() {
    let (env, admin, contract, id) = setup();
    env.mock_all_auths();
    attest(&env, &contract, &admin, &id);
    env.mock_auths(&[]);
    let client = JadeAttestationClient::new(&env, &contract);
    assert!(client.try_revoke(&id).is_err());
    assert_eq!(
        client.get_attestation(&id).unwrap().status,
        AttestationStatus::Active
    );
}

#[test]
fn missing_attestation_is_explicit() {
    let (env, _, contract, id) = setup();
    env.mock_all_auths();
    let client = JadeAttestationClient::new(&env, &contract);
    assert_eq!(client.get_attestation(&id), None);
    assert_eq!(client.try_revoke(&id), Err(Ok(Error::NotFound)));
}

#[test]
fn empty_identifier_is_rejected() {
    let (env, admin, contract, _) = setup();
    env.mock_all_auths();
    let client = JadeAttestationClient::new(&env, &contract);
    assert_eq!(
        client.try_attest(
            &String::from_str(&env, ""),
            &BytesN::from_array(&env, &[7; 32]),
            &String::from_str(&env, "0.1"),
            &ValidationResult::Error,
            &admin,
        ),
        Err(Ok(Error::InvalidInput))
    );
}

/// Experiment (Atividade 4): default TTLs and how they decay with ledger time.
/// Values are those of the native test environment (soroban-sdk 27.0.6) and
/// mirror the protocol defaults used for the networks at that SDK version.
#[test]
fn ttl_defaults_and_decay() {
    let (env, _, contract, id) = setup();
    let key = DataKey::Attestation(id);
    let info = env.ledger().get();
    assert_eq!(info.min_persistent_entry_ttl, 4096);
    assert_eq!(info.min_temp_entry_ttl, 16);
    assert_eq!(info.max_entry_ttl, 6_312_000);

    // Raw writes bypass attest(), which renews TTL; this shows the defaults.
    env.as_contract(&contract, || env.storage().persistent().set(&key, &1u32));
    let ttl = |env: &Env| {
        env.as_contract(&contract, || {
            (
                env.storage().persistent().get_ttl(&key),
                env.storage().instance().get_ttl(),
            )
        })
    };
    // Newly written entries live min_persistent_entry_ttl - 1 ledgers.
    assert_eq!(ttl(&env), (4095, 4095));
    env.ledger().with_mut(|l| l.sequence_number += 1000);
    assert_eq!(ttl(&env), (3095, 3095));
}

/// Experiment: Temporary entries are deleted at expiry, which is why they are
/// unsuitable for certificates; Persistent entries are not.
#[test]
fn temporary_entries_expire_but_persistent_attestations_remain_readable() {
    let (env, admin, contract, id) = setup();
    env.mock_all_auths();
    attest(&env, &contract, &admin, &id);
    let scratch = DataKey::Attestation(String::from_str(&env, "scratch"));
    env.as_contract(&contract, || {
        env.storage().temporary().set(&scratch, &1u32);
        assert_eq!(env.storage().temporary().get_ttl(&scratch), 15);
    });
    env.ledger().with_mut(|l| l.sequence_number += 5000);
    env.as_contract(&contract, || {
        assert!(!env.storage().temporary().has(&scratch));
    });
    let client = JadeAttestationClient::new(&env, &contract);
    assert!(client.get_attestation(&id).is_some());
}

/// Experiment: extend_ttl only acts when the remaining TTL is below the
/// threshold, and is capped by max_entry_ttl.
#[test]
fn extend_ttl_respects_threshold() {
    let (env, _, contract, id) = setup();
    let key = DataKey::Attestation(id);
    env.as_contract(&contract, || {
        let store = env.storage().persistent();
        store.set(&key, &1u32);
        // Remaining TTL (4095) is above the threshold: no change.
        store.extend_ttl(&key, 100, 200);
        assert_eq!(store.get_ttl(&key), 4095);
        // Threshold above remaining TTL: extended to the requested value.
        store.extend_ttl(&key, 5000, 10_000);
        assert_eq!(store.get_ttl(&key), 10_000);
    });
}

/// Experiment: the native test host does not model archival; an expired
/// Persistent entry is still readable and still blocks overwrites.
/// Real archival/restoration must be validated on a network (see
/// docs/research/soroban-storage-ttl.md).
#[test]
fn expired_persistent_attestation_cannot_be_overwritten_in_test_host() {
    let (env, admin, contract, id) = setup();
    env.mock_all_auths();
    attest(&env, &contract, &admin, &id);
    env.ledger().with_mut(|l| l.sequence_number += 5000);
    let client = JadeAttestationClient::new(&env, &contract);
    assert_eq!(
        client.try_attest(
            &id,
            &BytesN::from_array(&env, &[9; 32]),
            &String::from_str(&env, "0.1"),
            &ValidationResult::Pass,
            &admin,
        ),
        Err(Ok(Error::AlreadyExists))
    );
    assert_eq!(
        client.get_attestation(&id).unwrap().evidence_hash,
        BytesN::from_array(&env, &[7; 32])
    );
}

#[test]
fn writes_renew_ttl_and_extend_ttl_is_permissionless() {
    let (env, admin, contract, id) = setup();
    env.mock_all_auths();
    attest(&env, &contract, &admin, &id);
    let key = DataKey::Attestation(id.clone());
    let ttl = |env: &Env| {
        env.as_contract(&contract, || {
            (
                env.storage().persistent().get_ttl(&key),
                env.storage().instance().get_ttl(),
            )
        })
    };
    assert_eq!(ttl(&env), (RENEW_TO, RENEW_TO));

    // Drop below the threshold, then renew without any authorization.
    env.ledger()
        .with_mut(|l| l.sequence_number += RENEW_TO - RENEW_THRESHOLD + 1);
    env.mock_auths(&[]);
    let client = JadeAttestationClient::new(&env, &contract);
    client.extend_ttl(&id);
    assert_eq!(ttl(&env), (RENEW_TO, RENEW_TO));
    assert_eq!(
        client.try_extend_ttl(&String::from_str(&env, "missing")),
        Err(Ok(Error::NotFound))
    );
}
