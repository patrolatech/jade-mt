import { ResearchNotImplementedError } from '@jade/schemas';
import type { EnvironmentalEvent } from '@jade/schemas';
import {
  EnvironmentalSourceUnavailableError,
  type EnvironmentalSource,
} from './environmental-source.js';

export function buildGenericWfsRequest(endpoint: string): URL {
  const url = new URL(endpoint);
  url.searchParams.set('service', 'WFS');
  url.searchParams.set('version', '2.0.0');
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('outputFormat', 'application/json');
  return url;
}

export class TerraBrasilisSource implements EnvironmentalSource {
  constructor(
    private readonly options: {
      endpoint?: string;
      fetch?: typeof globalThis.fetch;
    } = {},
  ) {}

  // Low-level transport stub only. Unknown JSON is not an EnvironmentalEvent[].
  async fetchFeatureCollection(): Promise<unknown> {
    if (!this.options.endpoint) {
      throw new ResearchNotImplementedError('TerraBrasilis endpoint');
    }
    try {
      const response = await (this.options.fetch ?? globalThis.fetch)(
        buildGenericWfsRequest(this.options.endpoint),
        {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error(`WFS HTTP ${response.status}`);
      return await response.json();
    } catch (cause) {
      throw new EnvironmentalSourceUnavailableError({ cause });
    }
  }

  fetchEvents(
    input: Parameters<EnvironmentalSource['fetchEvents']>[0],
  ): Promise<EnvironmentalEvent[]> {
    // TODO(intern-gis): discover/document actual PRODES and DETER endpoints/layers.
    // TODO(intern-gis): determine temporal attributes and preserve their precision.
    // TODO(intern-gis): implement spatial/temporal filters and appropriate srsName.
    // TODO(intern-gis): validate payloads, map events, and handle paging/truncation.
    // Do not treat the generic, unfiltered transport response as complete evidence.
    void input;
    return Promise.reject(
      new ResearchNotImplementedError(
        'TerraBrasilis event mapping and WFS filters',
      ),
    );
  }
}
