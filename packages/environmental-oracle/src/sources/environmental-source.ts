import type { EnvironmentalEvent, Geometry } from '@jade/schemas';

export interface EnvironmentalSource {
  fetchEvents(input: {
    geometry: Geometry;
    cutoffDate: Date;
  }): Promise<EnvironmentalEvent[]>;
}

export class EnvironmentalSourceUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('Environmental source unavailable', options);
    this.name = 'EnvironmentalSourceUnavailableError';
  }
}
