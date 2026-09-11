export type { EnvironmentalEvent } from './domain/environmental-event.js';
export type { ValidationInput } from './domain/validation-input.js';
export type {
  ValidationResult,
  ValidationStatus,
} from './domain/validation-result.js';
export { EnvironmentalSourceUnavailableError } from './sources/environmental-source.js';
export type { EnvironmentalSource } from './sources/environmental-source.js';
export {
  TerraBrasilisSource,
  buildGenericWfsRequest,
} from './sources/terrabrasilis.source.js';
export { decideEnvironmentalStatus } from './validation/decision-rule.js';
export type {
  DecisionInput,
  DecisionRule,
} from './validation/decision-rule.js';
export { validateEnvironmentalOrigin } from './validation/validate-environmental-origin.js';
export type { ValidationDependencies } from './validation/validate-environmental-origin.js';
