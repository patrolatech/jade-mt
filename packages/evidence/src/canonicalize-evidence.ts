import {
  ResearchNotImplementedError,
  type EvidenceManifestV01,
} from '@jade/schemas';

export type EvidenceCanonicalizer = (
  manifest: EvidenceManifestV01,
) => Uint8Array;

export function canonicalizeEvidence(
  manifest: EvidenceManifestV01,
  canonicalizer?: EvidenceCanonicalizer,
): Uint8Array {
  if (!canonicalizer)
    throw new ResearchNotImplementedError('Evidence canonicalization');
  return canonicalizer(manifest);
}
