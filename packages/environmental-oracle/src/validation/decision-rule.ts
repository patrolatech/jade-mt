import { utc } from '@date-fns/utc';
import {
  endOfDay,
  endOfMonth,
  endOfYear,
  isAfter,
  isValid,
  parseISO,
} from 'date-fns';
import type {
  EnvironmentalEvent,
  SourceReport,
  ValidationInput,
  ValidationResult,
  ValidationStatus,
} from '@jade/schemas';

export interface DecisionInput {
  input: ValidationInput;
  events: EnvironmentalEvent[];
  eventAnalyses: ValidationResult['eventAnalyses'];
  sources: SourceReport[];
}
export type DecisionRule = (input: DecisionInput) => ValidationStatus;

export function temporalRelation(
  event: EnvironmentalEvent,
  cutoff: string,
): 'before' | 'after' | 'uncertain' {
  const date = event.observedAt;
  const cutoffEnd = endOfDay(parseISO(cutoff, { in: utc }));
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(cutoff) ||
    !isValid(cutoffEnd) ||
    !date ||
    !event.temporalBasis ||
    event.temporalBasis === 'unknown' ||
    event.temporalBasis === 'prodes-year'
  )
    return 'uncertain';

  const start = parseISO(date, { in: utc });
  if (!isValid(start)) return 'uncertain';
  let end: Date;
  if (event.temporalPrecision === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    end = endOfDay(start);
  } else if (
    event.temporalPrecision === 'month' &&
    /^\d{4}-\d{2}$/.test(date)
  ) {
    end = endOfMonth(start);
  } else if (event.temporalPrecision === 'year' && /^\d{4}$/.test(date)) {
    end = endOfYear(start);
  } else return 'uncertain';

  if (!isAfter(end, cutoffEnd)) return 'before';
  if (event.temporalBasis === 'occurrence' && isAfter(start, cutoffEnd))
    return 'after';
  return 'uncertain';
}

export function hasSufficientCoverage(sources: SourceReport[]): boolean {
  return (
    sources.length > 0 &&
    sources.every((source) => source.coverage.status === 'sufficient')
  );
}

export function evaluateDecisionProposal({
  input,
  events,
  eventAnalyses,
  sources,
}: DecisionInput): ValidationStatus {
  if (!hasSufficientCoverage(sources)) return 'INCONCLUSIVE';
  const analyses = new Map(
    eventAnalyses.map((item) => [item.eventId, item.analysis]),
  );
  if (
    analyses.size !== events.length ||
    new Set(events.map((event) => event.id)).size !== events.length
  )
    return 'INCONCLUSIVE';
  let hasPostCutoff = false;
  for (const event of events) {
    const analysis = analyses.get(event.id);
    if (
      !analysis ||
      !Number.isFinite(analysis.intersectionAreaM2) ||
      analysis.intersectionAreaM2 < 0
    )
      return 'INCONCLUSIVE';
    if (analysis.intersectionAreaM2 === 0) continue;
    const relation = temporalRelation(event, input.cutoffDate);
    if (relation === 'uncertain') return 'INCONCLUSIVE';
    if (relation === 'after') hasPostCutoff = true;
  }
  return hasPostCutoff ? 'FAIL' : 'PASS';
}

export const decideEnvironmentalStatus: DecisionRule = () => 'INCONCLUSIVE';
