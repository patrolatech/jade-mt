import { randomUUID } from 'node:crypto';
import {
  EnvironmentalSourceUnavailableError,
  validateEnvironmentalOrigin,
  type SourcePageEvidence,
  type ValidationDependencies,
} from '@jade/environmental-oracle';
import type { ValidationRepository } from '@jade/database';
import { ResearchNotImplementedError } from '@jade/schemas';
import type {
  ArchivedSourcePage,
  EnvironmentalEvent,
  ValidationInput,
} from '@jade/schemas';

export class ValidationExecutionError extends Error {
  constructor(
    public readonly validationId: string,
    cause: unknown,
  ) {
    super('Validation execution failed', { cause });
  }
}

export function classifyExecutionError(cause: unknown) {
  if (cause instanceof EnvironmentalSourceUnavailableError)
    return { code: 'SOURCE_UNAVAILABLE', message: cause.message } as const;
  if (cause instanceof ResearchNotImplementedError)
    return {
      code: 'RESEARCH_NOT_IMPLEMENTED',
      message: cause.message,
    } as const;
  return {
    code: 'INTERNAL_ERROR',
    message: 'Validation could not be completed',
  } as const;
}

export interface ValidationPersistence {
  repository: ValidationRepository;
  describePage: (page: SourcePageEvidence) => Promise<ArchivedSourcePage>;
}

export function createValidationService(
  dependencies: ValidationDependencies,
  persistence?: ValidationPersistence,
) {
  return async (input: ValidationInput) => {
    const validationId = randomUUID();
    // Offline replay runs without persistence.
    if (!persistence)
      return validateEnvironmentalOrigin(input, dependencies, validationId);
    await dependencies.geometryRepository.validateProperty(input.geometry);
    await persistence.repository.start(validationId, input);
    const evidence: ArchivedSourcePage[] = [];
    let events: EnvironmentalEvent[] = [];
    try {
      const result = await validateEnvironmentalOrigin(
        input,
        {
          ...dependencies,
          geometryRepository: {
            // Already validated before creating the run; avoid another DB round-trip.
            validateProperty: async () => {},
            analyzeIntersection: (geometry) =>
              dependencies.geometryRepository.analyzeIntersection(geometry),
          },
          source: {
            fetchEvents: async (query) => {
              const sourceResult = await dependencies.source.fetchEvents({
                ...query,
                onPage: async (page) => {
                  evidence.push(await persistence.describePage(page));
                },
              });
              events = sourceResult.events;
              return sourceResult;
            },
          },
        },
        validationId,
      );
      await persistence.repository.complete(result, events, evidence);
      return result;
    } catch (cause) {
      try {
        await persistence.repository.fail(
          { ...classifyExecutionError(cause), validationId },
          evidence,
        );
      } catch (persistenceError) {
        throw new ValidationExecutionError(
          validationId,
          new AggregateError(
            [cause, persistenceError],
            'Could not finalize validation history',
          ),
        );
      }
      throw new ValidationExecutionError(validationId, cause);
    }
  };
}

export type ValidationService = ReturnType<typeof createValidationService>;
