import { describe, expect, it, vi } from 'vitest';
import type { GeometryRepository } from '@jade/database';
import {
  ResearchNotImplementedError,
  type EnvironmentalEvent,
  type Geometry,
  type ValidationInput,
} from '@jade/schemas';
import {
  EnvironmentalSourceUnavailableError,
  type EnvironmentalSource,
} from '../sources/environmental-source.js';
import { validateEnvironmentalOrigin } from './validate-environmental-origin.js';
import { decideEnvironmentalStatus } from './decision-rule.js';

const property: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ],
  ],
};
const overlap: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
      [1, 1],
    ],
  ],
};
const disjoint: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [4, 4],
      [5, 4],
      [5, 5],
      [4, 5],
      [4, 4],
    ],
  ],
};
const input: ValidationInput = {
  geometry: property,
  cutoffDate: '2020-12-31',
  commodity: 'soy',
};
const validationId = 'a42db300-96a5-4f94-a6b1-17845b4b1774';
const event = (
  geometry: Geometry,
  observedAt = '2021-01-01',
): EnvironmentalEvent => ({
  id: 'synthetic-1',
  provider: 'synthetic',
  dataset: 'fixture',
  geometry,
  observedAt,
  temporalPrecision: 'day',
});
const sourceFor = (events: EnvironmentalEvent[]): EnvironmentalSource => ({
  fetchEvents: vi.fn(async () => events),
});
const repositoryFor = (intersectionExists: boolean): GeometryRepository => ({
  // Deliberate measurements supplied by the fixture, never geographic calculations.
  analyzeIntersection: vi.fn(async () => ({
    intersectionExists,
    intersectionAreaM2: intersectionExists ? 1 : 0,
    intersectionPercentage: intersectionExists ? 25 : 0,
  })),
});

describe('orchestration boundaries', () => {
  it('passes geometry, cutoff, events and per-event measurements through each boundary', async () => {
    const events = [event(overlap)];
    const source = sourceFor(events);
    const geometryRepository = repositoryFor(true);
    const decisionRule = vi.fn(() => 'INCONCLUSIVE' as const);
    const result = await validateEnvironmentalOrigin(
      input,
      { source, geometryRepository, decisionRule },
      validationId,
    );
    expect(source.fetchEvents).toHaveBeenCalledWith({
      geometry: property,
      cutoffDate: new Date('2020-12-31T00:00:00Z'),
    });
    expect(geometryRepository.analyzeIntersection).toHaveBeenCalledWith({
      property,
      event: overlap,
    });
    expect(decisionRule).toHaveBeenCalledWith({
      input,
      events,
      eventAnalyses: result.eventAnalyses,
    });
    expect(result).toMatchObject({
      validationId,
      status: 'INCONCLUSIVE',
      eventsFound: 1,
      methodology: { id: 'JADE-ENV', version: '0.1' },
    });
  });

  it('does not assume no events means PASS when the real decision rule is pending', async () => {
    const geometryRepository = repositoryFor(false);
    await expect(
      validateEnvironmentalOrigin(
        input,
        { source: sourceFor([]), geometryRepository },
        validationId,
      ),
    ).rejects.toThrow(ResearchNotImplementedError);
    expect(geometryRepository.analyzeIntersection).not.toHaveBeenCalled();
  });

  it('preserves a source failure instead of reporting an environmental decision', async () => {
    const source: EnvironmentalSource = {
      fetchEvents: vi
        .fn()
        .mockRejectedValue(new EnvironmentalSourceUnavailableError()),
    };
    const geometryRepository = repositoryFor(false);
    const decisionRule = vi.fn(decideEnvironmentalStatus);
    await expect(
      validateEnvironmentalOrigin(
        input,
        { source, geometryRepository, decisionRule },
        validationId,
      ),
    ).rejects.toThrow(EnvironmentalSourceUnavailableError);
    expect(geometryRepository.analyzeIntersection).not.toHaveBeenCalled();
    expect(decisionRule).not.toHaveBeenCalled();
  });

  it('does not classify an incomplete geometry analysis', async () => {
    const decisionRule = vi.fn(decideEnvironmentalStatus);
    const geometryRepository: GeometryRepository = {
      analyzeIntersection: vi
        .fn()
        .mockRejectedValue(new ResearchNotImplementedError('geometry policy')),
    };
    await expect(
      validateEnvironmentalOrigin(
        input,
        {
          source: sourceFor([event(overlap)]),
          geometryRepository,
          decisionRule,
        },
        validationId,
      ),
    ).rejects.toThrow(ResearchNotImplementedError);
    expect(decisionRule).not.toHaveBeenCalled();
  });
});

describe('JADE-ENV-0.1 research hypotheses — enable after methodology review', () => {
  it.skip('A — no intersection → PASS (TODO: source completeness and spatial rule)', async () => {
    const result = await validateEnvironmentalOrigin(
      input,
      {
        source: sourceFor([event(disjoint)]),
        geometryRepository: repositoryFor(false),
      },
      validationId,
    );
    expect(result.status).toBe('PASS');
  });
  it.skip('B — intersection before cutoff → initially PASS (TODO: temporal rule)', async () => {
    const result = await validateEnvironmentalOrigin(
      input,
      {
        source: sourceFor([event(overlap, '2020-01-01')]),
        geometryRepository: repositoryFor(true),
      },
      validationId,
    );
    expect(result.status).toBe('PASS');
  });
  it.skip('C — intersection after cutoff → FAIL (TODO: source hierarchy and threshold)', async () => {
    const result = await validateEnvironmentalOrigin(
      input,
      {
        source: sourceFor([event(overlap)]),
        geometryRepository: repositoryFor(true),
      },
      validationId,
    );
    expect(result.status).toBe('FAIL');
  });
  it.skip('D — source unavailable → INCONCLUSIVE (TODO: failure-to-status policy)', async () => {
    const source: EnvironmentalSource = {
      fetchEvents: vi
        .fn()
        .mockRejectedValue(new EnvironmentalSourceUnavailableError()),
    };
    const result = await validateEnvironmentalOrigin(
      input,
      { source, geometryRepository: repositoryFor(false) },
      validationId,
    );
    expect(result.status).toBe('INCONCLUSIVE');
  });
});
