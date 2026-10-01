import { createHash } from 'node:crypto';
import { utc } from '@date-fns/utc';
import { isValid, parseISO } from 'date-fns';
import {
  isPolygonGeometry,
  type EnvironmentalEvent,
  type Geometry,
  type SourceReport,
} from '@jade/schemas';
import {
  EnvironmentalSourceUnavailableError,
  type EnvironmentalSource,
  type EnvironmentalSourceResult,
  type SourcePageEvidence,
} from './environmental-source.js';
export type { SourcePageEvidence } from './environmental-source.js';

export const PRODES_ENDPOINT =
  'https://terrabrasilis.dpi.inpe.br/geoserver/prodes-legal-amz/wfs';
export const DETER_ENDPOINT =
  'https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/wfs';
export const PRODES_LAYER = 'prodes-legal-amz:yearly_deforestation';
export const DETER_LAYER = 'deter-amz:deter_amz';
export const WFS_VERSION = '2.0.0';
export const OUTPUT_FORMAT = 'application/json';
export const PROCESSING_CRS = 'EPSG:4326';
const PAGE_SIZE = 100;
const MAX_EVENTS = 10_000;
export type TerraBrasilisDataset = 'PRODES' | 'DETER';
const ADAPTER_VERSION = 'terrabrasilis-wfs/0.3';

function polygonWkt(geometry: Geometry): string {
  if (!isPolygonGeometry(geometry)) {
    throw new Error(
      'Expected a closed Polygon or MultiPolygon in longitude/latitude',
    );
  }
  const polygon = (rings: number[][][]) =>
    `(${rings
      .map(
        (ring) =>
          `(${ring.map(([longitude, latitude]) => `${longitude} ${latitude}`).join(',')})`,
      )
      .join(',')})`;
  return geometry.type === 'Polygon'
    ? `POLYGON${polygon(geometry.coordinates)}`
    : `MULTIPOLYGON(${geometry.coordinates.map(polygon).join(',')})`;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid WFS object');
  }
  return value as Record<string, unknown>;
}

function readPage(data: unknown): { features: unknown[]; matched: number } {
  const page = record(data);
  if (
    page.type !== 'FeatureCollection' ||
    !Array.isArray(page.features) ||
    typeof page.numberMatched !== 'number' ||
    !Number.isSafeInteger(page.numberMatched) ||
    page.numberMatched < 0 ||
    page.numberReturned !== page.features.length
  ) {
    throw new Error('Invalid or incomplete WFS FeatureCollection');
  }
  const crs = record(record(page.crs).properties).name;
  if (crs !== 'urn:ogc:def:crs:EPSG::4326' && crs !== 'EPSG:4326') {
    throw new Error(
      'WFS response did not identify the requested EPSG:4326 CRS',
    );
  }
  return { features: page.features, matched: page.numberMatched };
}

export function buildWfsRequest(
  endpoint: string,
  layer: string,
  params: URLSearchParams,
): URL {
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
      datasets?: TerraBrasilisDataset[];
      onPage?: (page: SourcePageEvidence) => Promise<void>;
      fetch?: typeof globalThis.fetch;
    } = {},
  ) {}

  async fetchEvents(input: {
    geometry: EnvironmentalEvent['geometry'];
    cutoffDate: Date;
    onPage?: (page: SourcePageEvidence) => Promise<void>;
  }): Promise<EnvironmentalSourceResult> {
    const wkt = polygonWkt(input.geometry);
    if (!Number.isFinite(input.cutoffDate.getTime()))
      throw new Error('Invalid cutoff date');
    const datasets = this.options.datasets ?? ['PRODES', 'DETER'];
    if (
      !datasets.length ||
      new Set(datasets).size !== datasets.length ||
      datasets.some((dataset) => dataset !== 'PRODES' && dataset !== 'DETER')
    ) {
      throw new Error('Select unique PRODES and/or DETER datasets');
    }
    const signal = AbortSignal.timeout(30_000);
    // Settle both datasets before returning so no archive callback outlives the run.
    const settled = await Promise.allSettled(
      datasets.map((dataset) =>
        this.fetchDataset(dataset, wkt, input.cutoffDate, signal, input.onPage),
      ),
    );
    const results: EnvironmentalSourceResult[] = [];
    for (const outcome of settled) {
      if (outcome.status === 'rejected') throw outcome.reason;
      results.push(outcome.value);
    }
    const events = results.flatMap((result) => result.events);
    if (events.length > MAX_EVENTS)
      throw new EnvironmentalSourceUnavailableError({
        cause: new Error('Combined WFS event limit exceeded'),
      });
    return { events, sources: results.flatMap((result) => result.sources) };
  }

  private async fetchPage(
    url: URL,
    signal: AbortSignal,
  ): Promise<SourcePageEvidence> {
    const method = url.href.length > 7_000 ? 'POST' : 'GET';
    const requestBody =
      method === 'POST' ? url.searchParams.toString() : undefined;
    const requestUrl =
      method === 'POST' ? `${url.origin}${url.pathname}` : url.href;
    try {
      const response = await (this.options.fetch ?? globalThis.fetch)(
        requestUrl,
        {
          method,
          ...(requestBody ? { body: requestBody } : {}),
          headers: {
            accept: 'application/json',
            ...(requestBody
              ? { 'content-type': 'application/x-www-form-urlencoded' }
              : {}),
          },
          signal,
        },
      );
      if (!response.ok) throw new Error(`WFS HTTP ${response.status}`);
      const bodyBytes = new Uint8Array(await response.arrayBuffer());
      const body = new TextDecoder().decode(bodyBytes);
      return {
        requestUrl,
        method,
        ...(requestBody ? { requestBody } : {}),
        retrievedAt: new Date().toISOString(),
        payloadHash: createHash('sha256').update(bodyBytes).digest('hex'),
        body,
        bodyBytes,
      };
    } catch (cause) {
      throw new EnvironmentalSourceUnavailableError({ cause });
    }
  }

  private async fetchDataset(
    source: TerraBrasilisDataset,
    wkt: string,
    cutoff: Date,
    signal: AbortSignal,
    onPage?: (page: SourcePageEvidence) => Promise<void>,
  ): Promise<EnvironmentalSourceResult> {
    const endpoint =
      this.options.endpoint ??
      (source === 'PRODES' ? PRODES_ENDPOINT : DETER_ENDPOINT);
    const layer = source === 'PRODES' ? PRODES_LAYER : DETER_LAYER;
    const events: EnvironmentalEvent[] = [];
    const ids = new Set<string>();
    const pages: SourceReport['pages'] = [];
    let expectedTotal: number | undefined;
    do {
      const params = new URLSearchParams({
        CQL_FILTER: `INTERSECTS(geom,SRID=4326;${wkt})`,
        count: String(PAGE_SIZE),
        sortBy: source === 'PRODES' ? 'fid' : 'gid',
        startIndex: String(events.length),
      });
      const url = buildWfsRequest(endpoint, layer, params);
      const evidence = await this.fetchPage(url, signal);
      // Archive failures are local errors, not upstream transport/protocol failures.
      await this.options.onPage?.(evidence);
      await onPage?.(evidence);
      try {
        const page = readPage(JSON.parse(evidence.body));
        if (
          page.matched > MAX_EVENTS ||
          (expectedTotal !== undefined && page.matched !== expectedTotal)
        ) {
          throw new Error(
            'WFS result limit exceeded or result changed during pagination',
          );
        }
        expectedTotal = page.matched;
        if (
          (page.features.length === 0 && events.length < expectedTotal) ||
          events.length + page.features.length > expectedTotal
        ) {
          throw new Error(
            'WFS pagination returned an incomplete or inconsistent result',
          );
        }
        for (const event of this.mapToEvents(
          page.features,
          source,
          layer,
          evidence.payloadHash,
        )) {
          if (ids.has(event.id))
            throw new Error('WFS pagination repeated a feature');
          ids.add(event.id);
          events.push(event);
        }
        pages.push({
          requestUrl: evidence.requestUrl,
          method: evidence.method,
          ...(evidence.requestBody
            ? { requestBody: evidence.requestBody }
            : {}),
          retrievedAt: evidence.retrievedAt,
          payloadHash: evidence.payloadHash,
          returned: page.features.length,
        });
      } catch (cause) {
        throw new EnvironmentalSourceUnavailableError({ cause });
      }
    } while (events.length < expectedTotal);
    return {
      events,
      sources: [
        {
          provider: 'INPE / TerraBrasilis',
          dataset: source,
          layer,
          crs: 'EPSG:4326',
          cutoffDate: cutoff.toISOString().slice(0, 10),
          datasetVersion: null,
          adapter: { name: 'TerraBrasilisSource', version: ADAPTER_VERSION },
          matchedEvents: events.length,
          pages,
          coverage: {
            status: 'unknown',
            reason:
              'Amazon source; biome coverage, cloud gaps, publication delay and a transaction-safe snapshot are not established for this input',
          },
        },
      ],
    };
  }

  private mapToEvents(
    features: unknown[],
    source: 'PRODES' | 'DETER',
    layer: string,
    payloadHash: string,
  ): EnvironmentalEvent[] {
    return features.map((f: unknown, index) => {
      const feat = record(f);
      const props = record(feat.properties);
      const id = feat.id;
      let observedAt =
        props[source === 'DETER' ? 'view_date' : 'image_date'] ?? null;
      let temporalPrecision: EnvironmentalEvent['temporalPrecision'] =
        observedAt === null ? 'unknown' : 'day';
      let temporalBasis: EnvironmentalEvent['temporalBasis'] =
        observedAt === null ? 'unknown' : 'observation';
      if (
        observedAt !== null &&
        (typeof observedAt !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(observedAt) ||
          !isValid(parseISO(observedAt, { in: utc })))
      )
        throw new Error('Invalid WFS observation date');
      if (source === 'PRODES' && observedAt === null && props.year != null) {
        if (
          typeof props.year !== 'number' ||
          !Number.isInteger(props.year) ||
          props.year < 1 ||
          props.year > 9999
        )
          throw new Error('Invalid PRODES reporting year');
        observedAt = String(props.year).padStart(4, '0');
        temporalPrecision = 'year';
        temporalBasis = 'prodes-year';
      }
      if (
        feat.type !== 'Feature' ||
        typeof id !== 'string' ||
        !id ||
        !isPolygonGeometry(feat.geometry)
      ) {
        throw new Error(
          'Invalid WFS feature, identifier, geometry or observation date',
        );
      }
      return {
        id,
        provider: 'INPE / TerraBrasilis',
        dataset: source,
        geometry: feat.geometry,
        observedAt: observedAt as string | null,
        temporalPrecision,
        temporalBasis,
        provenance: {
          layer,
          payloadHash,
          recordLocator: `/features/${index}`,
          normalizerVersion: ADAPTER_VERSION,
        },
      };
    });
  }
}
