import { InvalidGeometryError, type GeometryRepository } from '@jade/database';
import type { ValidationInput, ValidationResult } from '@jade/schemas';
import type { EnvironmentalSource } from '../sources/environmental-source.js';
import {
  decideEnvironmentalStatus,
  hasSufficientCoverage,
  temporalRelation,
  type DecisionRule,
} from './decision-rule.js';

export interface ValidationDependencies {
  source: EnvironmentalSource;
  geometryRepository: GeometryRepository;
  decisionRule?: DecisionRule;
}

export async function validateEnvironmentalOrigin(
  input: ValidationInput,
  dependencies: ValidationDependencies,
  validationId: string,
): Promise<ValidationResult> {
  await dependencies.geometryRepository.validateProperty(input.geometry);
  const { events, sources } = await dependencies.source.fetchEvents({
    geometry: input.geometry,
    cutoffDate: new Date(`${input.cutoffDate}T00:00:00.000Z`),
  });
  const eventAnalyses: ValidationResult['eventAnalyses'] = [];
  const issues: NonNullable<ValidationResult['issues']> = [];
  for (const event of events) {
    try {
      eventAnalyses.push({
        eventId: event.id,
        analysis: await dependencies.geometryRepository.analyzeIntersection({
          property: input.geometry,
          event: event.geometry,
        }),
      });
    } catch (error) {
      if (!(error instanceof InvalidGeometryError) || error.target !== 'event')
        throw error;
      issues.push({
        code: 'INVALID_EVENT_GEOMETRY',
        eventId: event.id,
        message: error.reason,
      });
    }
  }
  const status =
    issues.length > 0
      ? 'INCONCLUSIVE'
      : (dependencies.decisionRule ?? decideEnvironmentalStatus)({
          input,
          events,
          eventAnalyses,
          sources,
        });
  if (!dependencies.decisionRule)
    issues.push({
      code: 'METHODOLOGY_PENDING_APPROVAL',
      message: 'JADE-ENV-0.1 is a proposal pending researcher approval',
    });
  if (!hasSufficientCoverage(sources))
    issues.push({
      code: 'INSUFFICIENT_COVERAGE',
      message:
        'Source coverage and observation completeness have not been established for this polygon and cutoff',
    });
  const analysesById = new Map(
    eventAnalyses.map((item) => [item.eventId, item]),
  );
  for (const event of events) {
    const analysis = analysesById.get(event.id);
    if (
      analysis &&
      analysis.analysis.intersectionAreaM2 > 0 &&
      temporalRelation(event, input.cutoffDate) === 'uncertain'
    ) {
      issues.push({
        code: 'UNCERTAIN_EVENT_DATE',
        eventId: event.id,
        message:
          'The available date does not establish which side of the cutoff the occurrence belongs to',
      });
    }
  }
  return {
    validationId,
    methodology: { id: 'JADE-ENV', version: '0.1' },
    methodologyStatus: 'draft',
    sources,
    status,
    eventsFound: events.length,
    eventAnalyses,
    ...(issues.length > 0 ? { issues } : {}),
  };
}
