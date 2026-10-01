import { describe, expect, it, vi } from 'vitest';
import { InvalidGeometryError, type GeometryRepository } from '@jade/database';
import {
  ResearchNotImplementedError,
  type EnvironmentalEvent,
  type SourceReport,
  type Geometry,
  type ValidationInput,
} from '@jade/schemas';
import {
  EnvironmentalSourceUnavailableError,
  type EnvironmentalSource,
} from '../sources/environmental-source.js';
import { validateEnvironmentalOrigin } from './validate-environmental-origin.js';
import {
  decideEnvironmentalStatus,
  evaluateDecisionProposal,
} from './decision-rule.js';

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
  temporalBasis: 'occurrence',
});
const sources: SourceReport[] = [
  {
    provider: 'synthetic',
    dataset: 'fixture',
    layer: 'fixture',
    crs: 'EPSG:4326',
    cutoffDate: input.cutoffDate,
    datasetVersion: 'test',
    matchedEvents: 0,
    pages: [],
    coverage: {
      status: 'sufficient',
      reason: 'Synthetic complete test universe',
    },
  },
];
const sourceFor = (events: EnvironmentalEvent[]): EnvironmentalSource => ({
  fetchEvents: vi.fn(async () => ({ events, sources })),
});
const repositoryFor = (
  intersectionExists: boolean,
  areaM2: number = 20,
): GeometryRepository => ({
  validateProperty: vi.fn(async () => {}),
  analyzeIntersection: vi.fn(async () => ({
    intersectionExists,
    intersectionAreaM2: intersectionExists ? areaM2 : 0,
    intersectionPercentage: intersectionExists ? (areaM2 > 0 ? 25 : 0) : 0,
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
    expect(geometryRepository.validateProperty).toHaveBeenCalledWith(property);
    expect(geometryRepository.analyzeIntersection).toHaveBeenCalledWith({
      property,
      event: overlap,
    });
    expect(decisionRule).toHaveBeenCalledWith({
      input,
      events,
      eventAnalyses: result.eventAnalyses,
      sources,
    });
    expect(result).toMatchObject({
      validationId,
      status: 'INCONCLUSIVE',
      eventsFound: 1,
      methodology: { id: 'JADE-ENV', version: '0.1' },
    });
  });

  it('keeps the production result inconclusive pending methodology approval', async () => {
    const geometryRepository = repositoryFor(false);
    const result = await validateEnvironmentalOrigin(
      input,
      { source: sourceFor([]), geometryRepository },
      validationId,
    );
    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.eventsFound).toBe(0);
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
      validateProperty: vi.fn(async () => {}),
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

  it('rejects an invalid property before fetching any events, even when the source would return empty', async () => {
    const source = sourceFor([]);
    const geometryRepository = repositoryFor(false);
    vi.mocked(geometryRepository.validateProperty).mockRejectedValue(
      new InvalidGeometryError('property', 'Self-intersection'),
    );
    await expect(
      validateEnvironmentalOrigin(
        input,
        { source, geometryRepository },
        validationId,
      ),
    ).rejects.toThrow(InvalidGeometryError);
    expect(source.fetchEvents).not.toHaveBeenCalled();
    expect(geometryRepository.analyzeIntersection).not.toHaveBeenCalled();
  });

  it('keeps valid measurements while reporting invalid events as inconclusive', async () => {
    const geometryRepository = repositoryFor(true, 20);
    vi.mocked(geometryRepository.analyzeIntersection).mockRejectedValueOnce(
      new InvalidGeometryError('event', 'Self-intersection'),
    );
    const decisionRule = vi.fn(decideEnvironmentalStatus);
    const result = await validateEnvironmentalOrigin(
      input,
      {
        source: sourceFor([
          { ...event(overlap), id: 'invalid' },
          { ...event(overlap), id: 'valid' },
        ]),
        geometryRepository,
        decisionRule,
      },
      validationId,
    );
    expect(result).toMatchObject({
      status: 'INCONCLUSIVE',
      eventsFound: 2,
      issues: [
        {
          code: 'INVALID_EVENT_GEOMETRY',
          eventId: 'invalid',
          message: 'Self-intersection',
        },
      ],
      eventAnalyses: [
        { eventId: 'valid', analysis: { intersectionAreaM2: 20 } },
      ],
    });
    expect(decisionRule).not.toHaveBeenCalled();
    expect(geometryRepository.analyzeIntersection).toHaveBeenCalledTimes(2);
  });
});

describe('Executable proposal A–D with synthetic complete coverage; not scientific approval', () => {
  it('A — no intersection → PASS', async () => {
    const result = await validateEnvironmentalOrigin(
      input,
      {
        decisionRule: evaluateDecisionProposal,
        source: sourceFor([event(disjoint)]),
        geometryRepository: repositoryFor(false),
      },
      validationId,
    );
    expect(result.status).toBe('PASS');
  });
  it('B — intersection before cutoff → PASS', async () => {
    const result = await validateEnvironmentalOrigin(
      input,
      {
        decisionRule: evaluateDecisionProposal,
        source: sourceFor([event(overlap, '2020-01-01')]),
        geometryRepository: repositoryFor(true),
      },
      validationId,
    );
    expect(result.status).toBe('PASS');
  });
  it('C — intersection after cutoff → FAIL', async () => {
    const result = await validateEnvironmentalOrigin(
      input,
      {
        decisionRule: evaluateDecisionProposal,
        source: sourceFor([event(overlap)]),
        geometryRepository: repositoryFor(true),
      },
      validationId,
    );
    expect(result.status).toBe('FAIL');
  });
  it('D — source unavailable → throws EnvironmentalSourceUnavailableError', async () => {
    const source: EnvironmentalSource = {
      fetchEvents: vi
        .fn()
        .mockRejectedValue(new EnvironmentalSourceUnavailableError()),
    };
    await expect(
      validateEnvironmentalOrigin(
        input,
        { source, geometryRepository: repositoryFor(false) },
        validationId,
      ),
    ).rejects.toThrow(EnvironmentalSourceUnavailableError);
  });
});
