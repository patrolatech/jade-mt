import type { EnvironmentalEvent, Geometry, SourceReport } from '@jade/schemas';

export interface SourcePageEvidence {
  requestUrl: string;
  method: 'GET' | 'POST';
  requestBody?: string;
  retrievedAt: string;
  payloadHash: string;
  body: string;
}

export interface EnvironmentalSourceResult {
  events: EnvironmentalEvent[];
  sources: SourceReport[];
}

export interface EnvironmentalSource {
  fetchEvents(input: {
    geometry: Geometry;
    cutoffDate: Date;
    onPage?: (page: SourcePageEvidence) => Promise<void>;
  }): Promise<EnvironmentalSourceResult>;
}

export class EnvironmentalSourceUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('Environmental source unavailable', options);
    this.name = 'EnvironmentalSourceUnavailableError';
  }
}
