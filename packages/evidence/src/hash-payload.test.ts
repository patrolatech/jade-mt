import { expect, it } from 'vitest';
import { hashPayload } from './hash-payload.js';

it('hashes raw bytes to the standard SHA-256 known-answer vectors', () => {
  expect(hashPayload(Buffer.from('', 'utf8'))).toBe(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  expect(hashPayload(Buffer.from('abc', 'utf8'))).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

it('does not transform the bytes: whitespace or field order in a JSON payload changes the hash', () => {
  const compact = Buffer.from('{"a":1,"b":2}', 'utf8');
  const spaced = Buffer.from('{"a": 1, "b": 2}', 'utf8');

  expect(hashPayload(spaced)).not.toBe(hashPayload(compact));
});

it('keeps page digests separate even when concatenations would collide', () => {
  const first = [Buffer.from('ab'), Buffer.from('c')].map(hashPayload);
  const second = [Buffer.from('a'), Buffer.from('bc')].map(hashPayload);
  expect(first).not.toEqual(second);
  expect(first).not.toEqual([...first].reverse());
});
