import { randomUUID } from 'node:crypto';
import {
  validateEnvironmentalOrigin,
  type ValidationDependencies,
} from '@jade/environmental-oracle';
import type { ValidationInput } from '@jade/schemas';

export function createValidationService(dependencies: ValidationDependencies) {
  return (input: ValidationInput) =>
    validateEnvironmentalOrigin(input, dependencies, randomUUID());
}

export type ValidationService = ReturnType<typeof createValidationService>;
