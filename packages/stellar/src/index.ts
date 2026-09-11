import { ResearchNotImplementedError } from '@jade/schemas';
import type { ValidationStatus } from '@jade/schemas';

export interface Attestation {
  validationId: string;
  evidenceHash: string;
  methodologyVersion: string;
  result: ValidationStatus;
  validator: string;
  status: 'Active' | 'Revoked';
}

export interface AttestationClient {
  attest(
    input: Omit<Attestation, 'status'>,
  ): Promise<{ transactionHash: string }>;
  getAttestation(validationId: string): Promise<Attestation | null>;
  revoke(validationId: string): Promise<{ transactionHash: string }>;
}

export interface StellarClientConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
}

export function createStellarClient(
  config: StellarClientConfig,
): AttestationClient {
  // TODO(intern-blockchain): generated contract bindings, enum/BytesN conversion,
  // simulation, external signer, submission, confirmation, and restoration.
  // No keys, network calls, or pretend transaction IDs are introduced by this stub.
  void config;
  const pending = () =>
    Promise.reject(new ResearchNotImplementedError('Stellar contract client'));
  return { attest: pending, getAttestation: pending, revoke: pending };
}
