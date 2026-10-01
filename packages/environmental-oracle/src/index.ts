export type {
  EnvironmentalEvent,
  ValidationInput,
  ValidationResult,
  ValidationStatus,
} from '@jade/schemas';
export { EnvironmentalSourceUnavailableError } from './sources/environmental-source.js';
export type {
  EnvironmentalSource,
  EnvironmentalSourceResult,
  SourcePageEvidence,
} from './sources/environmental-source.js';
export type { TerraBrasilisDataset } from './sources/terrabrasilis.source.js';
export {
  TerraBrasilisSource,
  PRODES_ENDPOINT,
  DETER_ENDPOINT,
  PRODES_LAYER,
  DETER_LAYER,
  WFS_VERSION,
  PROCESSING_CRS,
} from './sources/terrabrasilis.source.js';
export {
  decideEnvironmentalStatus,
  evaluateDecisionProposal,
} from './validation/decision-rule.js';
export type {
  DecisionInput,
  DecisionRule,
} from './validation/decision-rule.js';
export { validateEnvironmentalOrigin } from './validation/validate-environmental-origin.js';
export type { ValidationDependencies } from './validation/validate-environmental-origin.js';
