import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import type { Geometry } from '@jade/schemas';

// Precondition: validate against GeometrySchema; validation input must also
// pass PolygonGeometrySchema and isPolygonGeometry (closed 2D WGS84 rings).
// Hashes the geometry exactly as submitted: no CRS reprojection, no
// normalization, no coordinate rounding. Those are open GIS-methodology
// decisions (docs/research/evidence-hashing.md); this only freezes the
// input geometry so a later normalization policy cannot silently change
// which evidence a past attestation refers to.
export function hashGeometry(geometry: Geometry): string {
  const canonicalJson = canonicalize(geometry);
  if (canonicalJson === undefined) {
    throw new TypeError('Geometry canonicalized to undefined');
  }
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}
