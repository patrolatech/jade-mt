import { createHash } from 'node:crypto';
import type { EvidenceManifestV01 } from '@jade/schemas';
import {
  canonicalizeEvidence,
  type EvidenceCanonicalizer,
} from './canonicalize-evidence.js';

export function hashEvidence(
  manifest: EvidenceManifestV01,
  canonicalizer?: EvidenceCanonicalizer,
): string {
  return createHash('sha256')
    .update(canonicalizeEvidence(manifest, canonicalizer))
    .digest('hex');
}
