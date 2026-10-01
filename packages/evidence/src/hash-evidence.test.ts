import { expect, it, vi } from 'vitest';
import {
  ResearchNotImplementedError,
  type EvidenceManifestV01,
} from '@jade/schemas';
import {
  canonicalizeEvidence,
  hashEvidence,
  jcsEvidenceCanonicalizer,
  EvidenceManifestV01Schema,
} from '@jade/evidence';
import { EvidenceManifestV01Schema as schema } from '@jade/schemas';

const manifest: EvidenceManifestV01 = {
  schema: 'jade-evidence/0.1',
  validationId: 'a42db300-96a5-4f94-a6b1-17845b4b1774',
  methodology: { id: 'JADE-ENV', version: '0.1' },
  input: {
    geometryHash: '0'.repeat(64),
    commodity: 'soy',
    cutoffDate: '2020-12-31',
  },
  sources: [],
  analysis: {
    intersectionAreaM2: null,
    intersectionPercentage: null,
    eventsFound: 0,
  },
  result: 'INCONCLUSIVE',
};

it('refuses hashing without an explicit canonicalization strategy', () => {
  expect(() => canonicalizeEvidence(manifest)).toThrow(
    ResearchNotImplementedError,
  );
  expect(() => hashEvidence(manifest)).toThrow(ResearchNotImplementedError);
});

it('hashes the exact supplied bytes with the SHA-256 known-answer vector', () => {
  const testOnlyCanonicalizer = vi.fn(() => Buffer.from('abc', 'utf8'));
  expect(hashEvidence(manifest, testOnlyCanonicalizer)).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  expect(testOnlyCanonicalizer).toHaveBeenCalledWith(manifest);
  expect(hashEvidence(manifest, () => Buffer.from('abc\n'))).not.toBe(
    hashEvidence(manifest, testOnlyCanonicalizer),
  );
});

it('hashes a manifest carrying the optional evidenceUri and implementationVersion fields', () => {
  const manifestWithOptionalFields: EvidenceManifestV01 = {
    ...manifest,
    evidenceUri:
      'https://evidence.example.com/a42db300-96a5-4f94-a6b1-17845b4b1774',
    implementationVersion: '0.1.0',
  };
  const testOnlyCanonicalizer = vi.fn(() => Buffer.from('abc', 'utf8'));

  expect(hashEvidence(manifestWithOptionalFields, testOnlyCanonicalizer)).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  expect(testOnlyCanonicalizer).toHaveBeenCalledWith(
    manifestWithOptionalFields,
  );
});

it('hashes end-to-end with the real JCS canonicalizer against a pinned vector', () => {
  const fullManifest: EvidenceManifestV01 = {
    schema: 'jade-evidence/0.1',
    validationId: 'a42db300-96a5-4f94-a6b1-17845b4b1774',
    methodology: { id: 'JADE-ENV', version: '0.1' },
    input: {
      geometryHash: '0'.repeat(64),
      commodity: 'soy',
      cutoffDate: '2020-12-31',
    },
    sources: [
      {
        provider: 'TerraBrasilis',
        dataset: 'PRODES',
        datasetVersion: '2024',
        layer: 'yearly_deforestation',
        retrievedAt: '2024-06-01T00:00:00.000Z',
        payloadHash: '1'.repeat(64),
      },
    ],
    analysis: {
      intersectionAreaM2: 1234.5,
      intersectionPercentage: 12.5,
      eventsFound: 1,
    },
    result: 'FAIL',
    evidenceUri:
      'https://evidence.example.com/a42db300-96a5-4f94-a6b1-17845b4b1774',
    implementationVersion: '0.1.0',
  };

  expect(hashEvidence(fullManifest, jcsEvidenceCanonicalizer)).toBe(
    '4d66802bb1d8f83066123d2d86468a0924c0d384b1a542b658423de4f6eea0c4',
  );
});

it('preserves the public schema re-export', () => {
  expect(EvidenceManifestV01Schema).toBe(schema);
});
