import { createHash } from 'node:crypto';

// Hashes the exact raw bytes retrieved from a source (already
// depagination-concatenated in fetch order, if applicable), before any
// parsing or mapping into EnvironmentalEvent domain objects. No
// canonicalization is applied: payloadHash exists so the original bytes can
// be independently re-fetched and compared, and transforming them first
// would hide bugs in the mapping logic behind a hash that still "matches".
export function hashPayload(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
