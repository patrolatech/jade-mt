extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{
        Address as _, AuthorizedFunction, AuthorizedInvocation, EnvTestConfig, Events as _,
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

#[test]
#[ignore = "TODO(intern-blockchain): evaluate TTL extension, archival, restoration and cost"]
fn ttl_lifecycle_research() {
    todo!("Define and test the contract instance, code and attestation TTL lifecycle");
}
