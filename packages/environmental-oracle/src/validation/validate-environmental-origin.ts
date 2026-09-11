import type { GeometryRepository } from '@jade/database';
import type { ValidationInput, ValidationResult } from '@jade/schemas';
import type { EnvironmentalSource } from '../sources/environmental-source.js';
import {
  decideEnvironmentalStatus,
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
  const events = await dependencies.source.fetchEvents({
    geometry: input.geometry,
    // Transport representation only; inclusivity and source date interpretation
    // remain research questions in the source adapter and decision rule.
    cutoffDate: new Date(`${input.cutoffDate}T00:00:00.000Z`),
  });
  const eventAnalyses: ValidationResult['eventAnalyses'] = [];
  for (const event of events) {
    eventAnalyses.push({
      eventId: event.id,
      analysis: await dependencies.geometryRepository.analyzeIntersection({
        property: input.geometry,
        event: event.geometry,
      }),
    });
  }
  const status = (dependencies.decisionRule ?? decideEnvironmentalStatus)({
    input,
    events,
    eventAnalyses,
  });
  return {
    validationId,
    methodology: { id: 'JADE-ENV', version: '0.1' },
    status,
    eventsFound: events.length,
    eventAnalyses,
  };
}
