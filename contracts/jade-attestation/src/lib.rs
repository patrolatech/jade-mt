#![no_std]
// soroban-sdk 27.0.6's generated conversions use Self::Error, which collides
// with the required ValidationResult::Error ABI variant (upstream macro issue).
#![allow(ambiguous_associated_items)]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    String,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ValidationResult {
    Pass,
    Fail,
    Inconclusive,
    Error,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AttestationStatus {
    Active,
    Revoked,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    pub validation_id: String,
    pub evidence_hash: BytesN<32>,
    pub methodology_version: String,
    pub result: ValidationResult,
    pub validator: Address,
    pub status: AttestationStatus,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Attestation(String),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 1,
    AlreadyExists = 2,
    NotFound = 3,
    InvalidInput = 4,
    NotInitialized = 5,
}

#[contractevent]
pub struct Attested {
    #[topic]
    pub validation_id: String,
    pub validator: Address,
}

#[contractevent]
pub struct Revoked {
    #[topic]
    pub validation_id: String,
}

#[contract]
pub struct JadeAttestation;

#[contractimpl]
impl JadeAttestation {
    pub fn __constructor(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn attest(
        env: Env,
        validation_id: String,
        evidence_hash: BytesN<32>,
        methodology_version: String,
        result: ValidationResult,
        validator: Address,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        if validator != admin {
            return Err(Error::Unauthorized);
        }
        validator.require_auth();
        if validation_id.is_empty()
            || validation_id.len() > 128
            || methodology_version.is_empty()
            || methodology_version.len() > 64
        {
            return Err(Error::InvalidInput);
        }
        let key = DataKey::Attestation(validation_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyExists);
        }
        let attestation = Attestation {
            validation_id: validation_id.clone(),
            evidence_hash,
            methodology_version,
            result,
            validator: validator.clone(),
            status: AttestationStatus::Active,
        };
        env.storage().persistent().set(&key, &attestation);
        Attested {
            validation_id,
            validator,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_attestation(env: Env, validation_id: String) -> Option<Attestation> {
        env.storage()
            .persistent()
            .get(&DataKey::Attestation(validation_id))
    }

    pub fn revoke(env: Env, validation_id: String) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        let key = DataKey::Attestation(validation_id.clone());
        let mut attestation: Attestation = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;
        if attestation.status == AttestationStatus::Revoked {
            return Ok(());
        }
        attestation.status = AttestationStatus::Revoked;
        env.storage().persistent().set(&key, &attestation);
        Revoked { validation_id }.publish(&env);
        Ok(())
    }
}

#[cfg(test)]
mod test;
