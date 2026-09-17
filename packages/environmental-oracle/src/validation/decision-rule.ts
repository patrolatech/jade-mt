import type {
  EnvironmentalEvent,
  ValidationInput,
  ValidationResult,
  ValidationStatus,
} from '@jade/schemas';

export interface DecisionInput {
  input: ValidationInput;
  events: EnvironmentalEvent[];
  eventAnalyses: ValidationResult['eventAnalyses'];
}

export type DecisionRule = (input: DecisionInput) => ValidationStatus;

export function decideEnvironmentalStatus(
  input: DecisionInput,
): ValidationStatus {
  const { events, eventAnalyses, input: validationInput } = input;

  if (events.length === 0) {
    return 'PASS';
  }

  const hasPostCutoffIntersection = events.some((event, index) => {
    const analysis = eventAnalyses[index];
    if (!analysis || !analysis.analysis.intersectionExists) return false;
    const eventDate = event.observedAt;
    if (!eventDate) return false;
    return eventDate > validationInput.cutoffDate;
  });

  const hasAnyIntersection = eventAnalyses.some(
    (a) => a.analysis.intersectionExists,
  );
  if (hasPostCutoffIntersection) {
    return 'FAIL';
  }

  if (hasAnyIntersection && !hasPostCutoffIntersection) {
    return 'PASS';
  }

  if (events.length > 0 && !hasAnyIntersection) {
    return 'PASS';
  }

  return 'INCONCLUSIVE';
}

export function classifySourceError(): ValidationStatus {
  return 'ERROR';
}

export function classifyIncompleteData(): ValidationStatus {
  return 'INCONCLUSIVE';
}