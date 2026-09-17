import { ResearchNotImplementedError } from '@jade/schemas';
import type { EnvironmentalEvent } from '@jade/schemas';
import {
  EnvironmentalSourceUnavailableError,
  type EnvironmentalSource,
} from './environmental-source.js';

export const PRODES_ENDPOINT = 'https://terrabrasilis.dpi.inpe.br/geoserver/prodes-legal-amz/wfs';
export const DETER_ENDPOINT = 'https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/wfs';
export const PRODES_LAYER = 'prodes-legal-amz:yearly_deforestation';
export const DETER_LAYER = 'deter-amz:deter_amz';
export const WFS_VERSION = '2.0.0';
export const OUTPUT_FORMAT = 'application/json';
export const PROCESSING_CRS = 'EPSG:4326';

export function buildWfsRequest(endpoint: string, layer: string, params: URLSearchParams): URL {
  const url = new URL(endpoint);
  url.searchParams.set('service', 'WFS');
  url.searchParams.set('version', WFS_VERSION);
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('typeName', layer);
  url.searchParams.set('outputFormat', OUTPUT_FORMAT);
  url.searchParams.set('srsName', PROCESSING_CRS);
  for (const [key, value] of params) {
    url.searchParams.set(key, value);
  }
  return url;
}

export class TerraBrasilisSource implements EnvironmentalSource {
  constructor(
    private readonly options: {
      endpoint?: string;
      fetch?: typeof globalThis.fetch;
    } = {},
  ) {}

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

  async fetchEvents(input: { geometry: EnvironmentalEvent['geometry']; cutoffDate: Date }): Promise<EnvironmentalEvent[]> {
    const source = this.determineSource();
    const cql = this.buildCql(source, input.cutoffDate);
    const url = this.buildFeatureUrl(source, cql);
    try {
      const response = await (this.options.fetch ?? globalThis.fetch)(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`WFS HTTP ${response.status}`);
      const data = await response.json();
      return this.mapToEvents(data, source);
    } catch (cause) {
      throw new EnvironmentalSourceUnavailableError({ cause });
    }
  }

  private determineSource(): 'PRODES' | 'DETER' {
    return 'DETER';
  }

  private buildCql(source: 'PRODES' | 'DETER', cutoffDate: Date): string {
    const dateStr = cutoffDate.toISOString().slice(0, 10);
    if (source === 'DETER') {
      return `view_date > '${dateStr}'`;
    }
    return `image_date > '${dateStr}'`;
  }

  private buildFeatureUrl(source: 'PRODES' | 'DETER', cql: string): URL {
    const endpoint = this.options.endpoint ?? (source === 'PRODES' ? PRODES_ENDPOINT : DETER_ENDPOINT);
    const layer = source === 'PRODES' ? PRODES_LAYER : DETER_LAYER;
    const params = new URLSearchParams();
    params.set('CQL_FILTER', cql);
    params.set('count', '100');
    params.set('sortBy', source === 'PRODES' ? 'fid' : 'gid');
    params.set('startIndex', '0');
    return buildWfsRequest(endpoint, layer, params);
  }

  private mapToEvents(data: unknown, source: 'PRODES' | 'DETER'): EnvironmentalEvent[] {
    const features = (data as { features?: unknown[] }).features ?? [];
    return features.map((f: unknown, i: number) => {
      const feat = f as { geometry?: { type: string; coordinates: unknown[] }; properties?: Record<string, unknown> };
      const props = feat.properties ?? {};
      const observedAt = source === 'DETER'
        ? (props.view_date as string) ?? null
        : (props.image_date as string) ?? null;
      return {
        id: `${source.toLowerCase()}-${i}-${Date.now()}`,
        provider: 'INPE / TerraBrasilis',
        dataset: source === 'PRODES' ? 'PRODES' : 'DETER',
        geometry: feat.geometry as EnvironmentalEvent['geometry'],
        observedAt,
        temporalPrecision: 'day' as const,
      };
    });
  }
}

export function buildGenericWfsRequest(endpoint: string): URL {
  const url = new URL(endpoint);
  url.searchParams.set('service', 'WFS');
  url.searchParams.set('version', WFS_VERSION);
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('outputFormat', OUTPUT_FORMAT);
  return url;
}