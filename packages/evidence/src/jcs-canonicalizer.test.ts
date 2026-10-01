import { expect, it } from 'vitest';
import type { EvidenceManifestV01 } from '@jade/schemas';
import { jcsEvidenceCanonicalizer } from './jcs-canonicalizer.js';

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
      provider: 'TerraBrasilis',
      dataset: 'PRODES',
      datasetVersion: '2024',
      layer: 'yearly_deforestation',
      retrievedAt: '2024-06-01T00:00:00.000Z',
      payloadHash: '1'.repeat(64),
    },
  ],
  analysis: {
    intersectionAreaM2: 1234.5,
    intersectionPercentage: 12.5,
    eventsFound: 1,
  },
  result: 'FAIL',
  evidenceUri:
    'https://evidence.example.com/a42db300-96a5-4f94-a6b1-17845b4b1774',
  implementationVersion: '0.1.0',
};

it('canonicalizes to the known RFC 8785 vector, with object keys sorted', () => {
  const bytes = jcsEvidenceCanonicalizer(manifest);
  expect(Buffer.from(bytes).toString('utf8')).toBe(
    '{"analysis":{"eventsFound":1,"intersectionAreaM2":1234.5,"intersectionPercentage":12.5},"evidenceUri":"https://evidence.example.com/a42db300-96a5-4f94-a6b1-17845b4b1774","implementationVersion":"0.1.0","input":{"commodity":"soy","cutoffDate":"2020-12-31","geometryHash":"0000000000000000000000000000000000000000000000000000000000000000"},"methodology":{"id":"JADE-ENV","version":"0.1"},"result":"FAIL","schema":"jade-evidence/0.1","sources":[{"dataset":"PRODES","datasetVersion":"2024","layer":"yearly_deforestation","payloadHash":"1111111111111111111111111111111111111111111111111111111111111111","provider":"TerraBrasilis","retrievedAt":"2024-06-01T00:00:00.000Z"}],"validationId":"a42db300-96a5-4f94-a6b1-17845b4b1774"}',
  );
});

it('produces identical bytes when object key insertion order differs at every nesting level', () => {
  // Built independently, with every object's keys inserted in reverse order,
  // to prove canonicalization does not depend on this repository's own
  // property insertion order (unlike a plain JSON.stringify()).
  const reordered: EvidenceManifestV01 = {
    implementationVersion: '0.1.0',
    evidenceUri:
      'https://evidence.example.com/a42db300-96a5-4f94-a6b1-17845b4b1774',
    result: manifest.result,
    analysis: {
      eventsFound: manifest.analysis.eventsFound,
      intersectionPercentage: manifest.analysis.intersectionPercentage,
      intersectionAreaM2: manifest.analysis.intersectionAreaM2,
    },
    sources: [
      {
        payloadHash: manifest.sources[0]!.payloadHash,
        retrievedAt: manifest.sources[0]!.retrievedAt,
        layer: manifest.sources[0]!.layer,
        datasetVersion: manifest.sources[0]!.datasetVersion,
        dataset: manifest.sources[0]!.dataset,
        provider: manifest.sources[0]!.provider,
      },
    ],
    input: {
      cutoffDate: manifest.input.cutoffDate,
      commodity: manifest.input.commodity,
      geometryHash: manifest.input.geometryHash,
    },
    methodology: {
      version: manifest.methodology.version,
      id: manifest.methodology.id,
    },
    validationId: manifest.validationId,
    schema: manifest.schema,
  };

  expect(Buffer.from(jcsEvidenceCanonicalizer(reordered))).toEqual(
    Buffer.from(jcsEvidenceCanonicalizer(manifest)),
  );
});

it('produces different bytes when the evidence itself changes', () => {
  const changed: EvidenceManifestV01 = { ...manifest, result: 'PASS' };

  expect(Buffer.from(jcsEvidenceCanonicalizer(changed))).not.toEqual(
    Buffer.from(jcsEvidenceCanonicalizer(manifest)),
  );
});

it('preserves array order, which is semantically meaningful (collection order)', () => {
  const secondSource: EvidenceManifestV01['sources'][number] = {
    provider: 'MapBiomas',
    dataset: 'Alerta',
    datasetVersion: null,
    layer: null,
    retrievedAt: '2024-06-02T00:00:00.000Z',
    payloadHash: '2'.repeat(64),
  };
  const forward: EvidenceManifestV01 = {
    ...manifest,
    sources: [manifest.sources[0]!, secondSource],
  };
  const reversed: EvidenceManifestV01 = {
    ...manifest,
    sources: [secondSource, manifest.sources[0]!],
  };

  expect(Buffer.from(jcsEvidenceCanonicalizer(forward))).not.toEqual(
    Buffer.from(jcsEvidenceCanonicalizer(reversed)),
  );
});

it('preserves null, distinguishing "not measured" from a real value', () => {
  const unmeasured: EvidenceManifestV01 = {
    ...manifest,
    analysis: { ...manifest.analysis, intersectionAreaM2: null },
  };
  const measuredZero: EvidenceManifestV01 = {
    ...manifest,
    analysis: { ...manifest.analysis, intersectionAreaM2: 0 },
  };

  expect(Buffer.from(jcsEvidenceCanonicalizer(unmeasured))).not.toEqual(
    Buffer.from(jcsEvidenceCanonicalizer(measuredZero)),
  );
});
