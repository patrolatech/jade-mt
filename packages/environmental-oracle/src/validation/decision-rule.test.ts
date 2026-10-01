import { describe, expect, it } from 'vitest';
import type { EnvironmentalEvent, SourceReport } from '@jade/schemas';
import {
  decideEnvironmentalStatus,
  evaluateDecisionProposal,
  type DecisionInput,
} from './decision-rule.js';

const event: EnvironmentalEvent = {
  id: 'test-1',
  provider: 'synthetic',
  dataset: 'test',
  geometry: { type: 'Polygon', coordinates: [] },
  observedAt: '2021-07-01',
  temporalPrecision: 'day',
  temporalBasis: 'occurrence',
};
const source: SourceReport = {
  provider: 'synthetic',
  dataset: 'test',
  layer: 'test',
  datasetVersion: 'test',
  crs: 'EPSG:4326',
  cutoffDate: '2021-06-15',
  matchedEvents: 1,
  pages: [],
  coverage: {
    status: 'sufficient',
    reason: 'Complete synthetic universe, not live-source approval',
  },
};
const input: DecisionInput = {
  input: {
    geometry: event.geometry,
    commodity: 'soy',
    cutoffDate: '2021-06-15',
  },
  events: [event],
  sources: [source],
  eventAnalyses: [
    {
      eventId: event.id,
      analysis: {
        intersectionExists: true,
        intersectionAreaM2: 10,
        intersectionPercentage: 10,
      },
    },
  ],
};

describe('decision proposal mechanics, pending researcher approval', () => {
  it.each([
    ['2021-06-14', 'day', 'occurrence', 'PASS'],
    ['2021-06-15', 'day', 'occurrence', 'PASS'],
    ['2021-06-16', 'day', 'occurrence', 'FAIL'],
    [null, 'unknown', 'unknown', 'INCONCLUSIVE'],
    ['2021-02-30', 'day', 'occurrence', 'INCONCLUSIVE'],
    ['2021-06', 'month', 'occurrence', 'INCONCLUSIVE'],
    ['2021-05', 'month', 'occurrence', 'PASS'],
    ['2021-07', 'month', 'occurrence', 'FAIL'],
    ['2020', 'year', 'occurrence', 'PASS'],
    ['2021', 'year', 'occurrence', 'INCONCLUSIVE'],
    ['2022', 'year', 'occurrence', 'FAIL'],
    ['2022', 'year', 'prodes-year', 'INCONCLUSIVE'],
    ['2021-07-01', 'day', 'observation', 'INCONCLUSIVE'],
    ['2021-06-01', 'day', 'observation', 'PASS'],
    ['2021-13', 'month', 'occurrence', 'INCONCLUSIVE'],
  ] as const)(
    '%s / %s / %s → %s',
    (observedAt, temporalPrecision, temporalBasis, expected) => {
      expect(
        evaluateDecisionProposal({
          ...input,
          events: [{ ...event, observedAt, temporalPrecision, temporalBasis }],
        }),
      ).toBe(expected);
    },
  );

  it.each(['unknown', 'insufficient'] as const)(
    'requires sufficient coverage even for empty results (%s)',
    (status) => {
      expect(
        evaluateDecisionProposal({
          ...input,
          events: [],
          eventAnalyses: [],
          sources: [{ ...source, coverage: { status, reason: 'not covered' } }],
        }),
      ).toBe('INCONCLUSIVE');
    },
  );
  it('requires a source assessment and measurements for every event', () => {
    expect(evaluateDecisionProposal({ ...input, sources: [] })).toBe(
      'INCONCLUSIVE',
    );
    expect(evaluateDecisionProposal({ ...input, eventAnalyses: [] })).toBe(
      'INCONCLUSIVE',
    );
  });
  it('does not count a boundary-only intersection, even with an undated event', () => {
    expect(
      evaluateDecisionProposal({
        ...input,
        events: [{ ...event, observedAt: null }],
        eventAnalyses: [
          {
            eventId: event.id,
            analysis: {
              intersectionExists: true,
              intersectionAreaM2: 0,
              intersectionPercentage: 0,
            },
          },
        ],
      }),
    ).toBe('PASS');
  });
  it('associates measurements by ID, independent of array ordering', () => {
    expect(
      evaluateDecisionProposal({
        ...input,
        events: [event, { ...event, id: 'test-2', observedAt: '2020-01-01' }],
        eventAnalyses: [
          { eventId: 'test-2', analysis: input.eventAnalyses[0]!.analysis },
          {
            eventId: event.id,
            analysis: {
              intersectionExists: false,
              intersectionAreaM2: 0,
              intersectionPercentage: 0,
            },
          },
        ],
      }),
    ).toBe('PASS');
  });
  it('keeps the production decision inconclusive even when the proposal could decide', () => {
    expect(evaluateDecisionProposal(input)).toBe('FAIL');
    expect(decideEnvironmentalStatus(input)).toBe('INCONCLUSIVE');
  });
  it.each([
    ['2024-02-29', 'day', '2024-02-29', 'PASS'],
    ['2023-02-29', 'day', '2024-02-29', 'INCONCLUSIVE'],
    ['2024-02', 'month', '2024-02-28', 'INCONCLUSIVE'],
    ['2024-02', 'month', '2024-02-29', 'PASS'],
    ['2023-02', 'month', '2023-02-28', 'PASS'],
    ['2024', 'year', '2024-12-30', 'INCONCLUSIVE'],
    ['2024', 'year', '2024-12-31', 'PASS'],
    ['2025', 'year', '2024-12-31', 'FAIL'],
    ['2024-02-29', 'day', '2023-02-29', 'INCONCLUSIVE'],
    ['2011-12-30', 'day', '2011-12-30', 'PASS'],
    ['2011-12-31', 'day', '2011-12-30', 'FAIL'],
  ] as const)(
    'compares %s (%s) with cutoff %s in UTC → %s',
    (observedAt, temporalPrecision, cutoffDate, expected) => {
      expect(
        evaluateDecisionProposal({
          ...input,
          input: { ...input.input, cutoffDate },
          events: [{ ...event, observedAt, temporalPrecision }],
        }),
      ).toBe(expected);
    },
  );
});
