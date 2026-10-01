import { createHash } from 'node:crypto';

// One SHA-256 per retrieved page, before decoding/parsing. Callers retain
// page boundaries and order in receipts; never concatenate paginated bodies.
export function hashPayload(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
