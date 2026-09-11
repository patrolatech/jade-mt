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
  // TODO(intern-blockchain): evaluate deterministic JSON canonicalization.
  // The same semantic evidence must always generate the same evidence_hash.
  // There is deliberately no JSON.stringify fallback or implicit production policy.
  if (!canonicalizer)
    throw new ResearchNotImplementedError('Evidence canonicalization');
  return canonicalizer(manifest);
}
