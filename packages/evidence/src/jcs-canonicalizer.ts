import canonicalize from 'canonicalize';
import type { EvidenceManifestV01 } from '@jade/schemas';
import type { EvidenceCanonicalizer } from './canonicalize-evidence.js';

// Precondition: manifest has passed EvidenceManifestV01Schema validation.
// RFC 8785 (JSON Canonicalization Scheme): a formal, multi-language standard
// instead of an implicit JSON.stringify() key order. Object keys are sorted;
// array order and null are preserved as-is.
export const jcsEvidenceCanonicalizer: EvidenceCanonicalizer = (
  manifest: EvidenceManifestV01,
): Uint8Array => {
  const canonicalJson = canonicalize(manifest);
  if (canonicalJson === undefined) {
    throw new TypeError('Evidence manifest canonicalized to undefined');
  }
  return Buffer.from(canonicalJson, 'utf8');
};
