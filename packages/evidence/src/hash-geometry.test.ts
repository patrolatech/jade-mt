import { expect, it } from 'vitest';
import { hashGeometry } from './hash-geometry.js';

it('hashes a Point geometry to the known vector', () => {
  const point = { type: 'Point' as const, coordinates: [-55.5, -12.3] };

  expect(hashGeometry(point)).toBe(
    'db80f687bec1e7d70acb3fa3d5ac584f9da114b559aa57864f45773eca3c4890',
  );
});

it('is sensitive to coordinate changes and stable across key order', () => {
  const point = { type: 'Point' as const, coordinates: [-55.5, -12.3] };
  const reorderedPoint = {
    coordinates: [-55.5, -12.3],
    type: 'Point' as const,
  };
  const differentPoint = {
    type: 'Point' as const,
    coordinates: [-55.6, -12.3],
  };

  expect(hashGeometry(reorderedPoint)).toBe(hashGeometry(point));
  expect(hashGeometry(differentPoint)).not.toBe(hashGeometry(point));
});
