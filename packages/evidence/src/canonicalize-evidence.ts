import {
  ResearchNotImplementedError,
  type EvidenceManifestV01,
} from '@jade/schemas';

export type EvidenceCanonicalizer = (
  manifest: EvidenceManifestV01,
) => Uint8Array;

// Precondition: manifest has passed EvidenceManifestV01Schema validation,
// including date/URI formats. TypeScript types do not validate external JSON.
export function canonicalizeEvidence(
  manifest: EvidenceManifestV01,
  canonicalizer?: EvidenceCanonicalizer,
): Uint8Array {
  if (!canonicalizer)
    throw new ResearchNotImplementedError('Evidence canonicalization');
  return canonicalizer(manifest);
}
