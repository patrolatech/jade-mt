import { createHash } from 'node:crypto';
import type { EvidenceManifestV01 } from '@jade/schemas';
import {
  canonicalizeEvidence,
  type EvidenceCanonicalizer,
} from './canonicalize-evidence.js';

// Precondition: manifest has passed EvidenceManifestV01Schema validation.
export function hashEvidence(
  manifest: EvidenceManifestV01,
  canonicalizer?: EvidenceCanonicalizer,
): string {
  return createHash('sha256')
    .update(canonicalizeEvidence(manifest, canonicalizer))
    .digest('hex');
}
