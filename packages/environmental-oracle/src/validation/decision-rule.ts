import { ResearchNotImplementedError } from '@jade/schemas';
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
  // TODO(research): implement JADE-ENV-0.1 after documenting intersection threshold,
  // temporal precision/boundaries, missing dates, unavailable/incomplete sources,
  // and source hierarchy. Empty events alone are not proof of a PASS.
  void input;
  throw new ResearchNotImplementedError('JADE-ENV-0.1 decision rule');
}
