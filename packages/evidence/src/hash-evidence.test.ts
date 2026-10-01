import { expect, it, vi } from 'vitest';
import {
  ResearchNotImplementedError,
  type EvidenceManifestV01,
} from '@jade/schemas';
import { canonicalizeEvidence, hashEvidence } from '@jade/evidence';

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
