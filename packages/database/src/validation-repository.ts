import type {
  ArchivedSourcePage,
  EnvironmentalEvent,
  StoredValidation,
  ValidationExecutionFailure,
  ValidationInput,
  ValidationResult,
} from '@jade/schemas';

export interface ValidationRepository {
  start(validationId: string, input: ValidationInput): Promise<void>;
  complete(
    result: ValidationResult,
    events: EnvironmentalEvent[],
    evidence: ArchivedSourcePage[],
  ): Promise<void>;
  fail(
    error: ValidationExecutionFailure,
    evidence: ArchivedSourcePage[],
  ): Promise<void>;
  find(validationId: string): Promise<StoredValidation | null>;
}
