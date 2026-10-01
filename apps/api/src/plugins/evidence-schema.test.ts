import Fastify from 'fastify';
import { expect, it } from 'vitest';
import {
  EvidenceManifestV01Schema,
  type EvidenceManifestV01,
} from '@jade/schemas';

it('validates legacy and extended manifests before hashing, including formats and strict fields', async () => {
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  app.post(
    '/manifest',
    { schema: { body: EvidenceManifestV01Schema } },
    async () => ({ valid: true }),
  );
  const manifest: EvidenceManifestV01 = {
    schema: 'jade-evidence/0.1',
    validationId: 'a42db300-96a5-4f94-a6b1-17845b4b1774',
    methodology: { id: 'JADE-ENV', version: '0.1' },
    input: {
      geometryHash: '0'.repeat(64),
      commodity: 'soy',
      cutoffDate: '2020-12-31',
    },
    sources: [
      {
        provider: 'INPE',
        dataset: 'DETER',
        datasetVersion: null,
        layer: null,
        retrievedAt: '2026-10-01T00:00:00Z',
        payloadHash: '1'.repeat(64),
      },
    ],
    analysis: {
      intersectionAreaM2: null,
      intersectionPercentage: null,
      eventsFound: 0,
    },
    result: 'INCONCLUSIVE',
  };
  const submit = (payload: object) =>
    app.inject({ method: 'POST', url: '/manifest', payload });
  try {
    expect((await submit(manifest)).statusCode).toBe(200);
    expect(
      (
        await submit({
          ...manifest,
          evidenceUri: null,
          implementationVersion: null,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await submit({
          ...manifest,
          evidenceUri: 'https://example.invalid/evidence',
          implementationVersion: 'test',
        })
      ).statusCode,
    ).toBe(200);
    for (const commodity of ['', '   ', 'x'.repeat(101)]) {
      expect(
        (await submit({ ...manifest, input: { ...manifest.input, commodity } }))
          .statusCode,
      ).toBe(400);
    }
    for (const payload of [
      { ...manifest, extra: true },
      { ...manifest, evidenceUri: 'not a URI' },
      { ...manifest, input: { ...manifest.input, cutoffDate: '2021-02-30' } },
      {
        ...manifest,
        sources: [{ ...manifest.sources[0], retrievedAt: 'not a date' }],
      },
      {
        ...manifest,
        sources: [{ ...manifest.sources[0], payloadHash: 'ABC' }],
      },
      { ...manifest, analysis: { ...manifest.analysis, eventsFound: -1 } },
    ])
      expect((await submit(payload)).statusCode).toBe(400);
  } finally {
    await app.close();
  }
});
