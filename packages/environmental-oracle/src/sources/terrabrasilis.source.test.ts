import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { SourcePageEvidence } from './terrabrasilis.source.js';
import type { Geometry } from '@jade/schemas';
import { TerraBrasilisSource } from './terrabrasilis.source.js';
import { EnvironmentalSourceUnavailableError } from './environmental-source.js';

const geometry: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-56.1, -15.6],
      [-56.09, -15.6],
      [-56.09, -15.59],
      [-56.1, -15.6],
    ],
  ],
};
const input = { geometry, cutoffDate: new Date('2020-12-31') };
const feature = (id: number) => ({
  type: 'Feature',
  id: `deter_amz.${id}`,
  geometry,
  properties: { view_date: '2021-01-02' },
});
const page = (features: unknown[], numberMatched = features.length) => ({
  type: 'FeatureCollection',
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
  features,
  numberMatched,
  numberReturned: features.length,
});
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });

it.each(['http', 'json', 'network'])(
  'preserves %s transport failure',
  async (failure) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    if (failure === 'http')
      fetch.mockResolvedValue(new Response('', { status: 503 }));
    else if (failure === 'json')
      fetch.mockResolvedValue(new Response('not-json'));
    else fetch.mockRejectedValue(new Error('offline'));
    await expect(
      new TerraBrasilisSource({
        datasets: ['DETER'],
        endpoint: 'https://example.invalid/wfs',
        fetch,
      }).fetchEvents(input),
    ).rejects.toThrow(EnvironmentalSourceUnavailableError);
  },
);

it('queries the exact polygon while retaining old and undated observations', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(response(page([feature(1)])));
  const { events } = await new TerraBrasilisSource({
    datasets: ['DETER'],
    fetch,
  }).fetchEvents(input);
  const url = new URL(String(fetch.mock.calls[0]![0]));
  expect(url.searchParams.get('CQL_FILTER')).toBe(
    'INTERSECTS(geom,SRID=4326;POLYGON((-56.1 -15.6,-56.09 -15.6,-56.09 -15.59,-56.1 -15.6)))',
  );
  expect(url.searchParams.get('sortBy')).toBe('gid');
  expect(events[0]).toMatchObject({
    id: 'deter_amz.1',
    geometry,
    observedAt: '2021-01-02',
  });
});

it('preserves holes and every component of a MultiPolygon in the spatial filter', async () => {
  const multi: Geometry = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 0],
        ],
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 1],
        ],
      ],
      [
        [
          [10, 10],
          [11, 10],
          [11, 11],
          [10, 10],
        ],
      ],
    ],
  };
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(response(page([])));
  await new TerraBrasilisSource({ datasets: ['DETER'], fetch }).fetchEvents({
    ...input,
    geometry: multi,
  });
  expect(
    new URL(String(fetch.mock.calls[0]![0])).searchParams.get('CQL_FILTER'),
  ).toContain(
    'MULTIPOLYGON(((0 0,4 0,4 4,0 0),(1 1,2 1,2 2,1 1)),((10 10,11 10,11 11,10 10)))',
  );
});

it('fetches more than 100 events without changing the spatial or temporal filter', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      response(
        page(
          Array.from({ length: 100 }, (_, i) => feature(i)),
          101,
        ),
      ),
    )
    .mockResolvedValueOnce(response(page([feature(100)], 101)));
  const { events } = await new TerraBrasilisSource({
    datasets: ['DETER'],
    fetch,
  }).fetchEvents(input);
  expect(events).toHaveLength(101);
  const urls = fetch.mock.calls.map(([url]) => new URL(String(url)));
  expect(urls.map((url) => url.searchParams.get('startIndex'))).toEqual([
    '0',
    '100',
  ]);
  expect(urls[1]!.searchParams.get('CQL_FILTER')).toBe(
    urls[0]!.searchParams.get('CQL_FILTER'),
  );
  expect(events[100]!.id).toBe('deter_amz.100');
});

it('continues pagination when the upstream page limit is smaller than requested', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response(page([feature(1)], 2)))
    .mockResolvedValueOnce(response(page([feature(2)], 2)));
  expect(
    (
      await new TerraBrasilisSource({ datasets: ['DETER'], fetch }).fetchEvents(
        input,
      )
    ).events,
  ).toHaveLength(2);
  expect(
    new URL(String(fetch.mock.calls[1]![0])).searchParams.get('startIndex'),
  ).toBe('1');
});

it.each([
  { error: 'upstream failure' },
  { type: 'FeatureCollection', features: [] },
  { ...page([]), numberReturned: 1 },
  page([], 1),
  page([], 10_001),
  page([{ ...feature(1), id: undefined }]),
  page([{ ...feature(1), geometry: null }]),
])(
  'rejects malformed or incomplete WFS responses instead of returning no events (%j)',
  async (payload) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response(payload));
    await expect(
      new TerraBrasilisSource({ datasets: ['DETER'], fetch }).fetchEvents(
        input,
      ),
    ).rejects.toThrow(EnvironmentalSourceUnavailableError);
  },
);

it.each(['repeated', 'missing', 'changed', 'unavailable'])(
  'rejects %s pages without returning a partial result',
  async (failure) => {
    const next =
      failure === 'repeated'
        ? page([feature(1)], 2)
        : failure === 'missing'
          ? page([], 2)
          : page([feature(2)], 3);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(page([feature(1)], 2)))
      .mockResolvedValueOnce(
        failure === 'unavailable'
          ? new Response('', { status: 503 })
          : response(next),
      );
    await expect(
      new TerraBrasilisSource({ datasets: ['DETER'], fetch }).fetchEvents(
        input,
      ),
    ).rejects.toThrow(EnvironmentalSourceUnavailableError);
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);

it('rejects an open ring before making a source request', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  await expect(
    new TerraBrasilisSource({ datasets: ['DETER'], fetch }).fetchEvents({
      ...input,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        ],
      },
    }),
  ).rejects.toThrow('closed Polygon');
  expect(fetch).not.toHaveBeenCalled();
});

it.each([null, '2021-02-30', '2021-13-01', '2023-02-29', '2024-2-29', 2024])(
  'preserves missing dates and rejects impossible dates (%s)',
  async (date) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        response(page([{ ...feature(1), properties: { view_date: date } }])),
      );
    const result = new TerraBrasilisSource({
      datasets: ['DETER'],
      fetch,
    }).fetchEvents(input);
    if (date === null)
      expect((await result).events[0]).toMatchObject({
        observedAt: null,
        temporalPrecision: 'unknown',
        temporalBasis: 'unknown',
      });
    else
      await expect(result).rejects.toThrow(EnvironmentalSourceUnavailableError);
  },
);

it.each([
  { dataset: 'PRODES', date: '2024-02-29' },
  { dataset: 'PRODES', date: '2011-12-30' },
  { dataset: 'DETER', date: '2024-02-29' },
  { dataset: 'DETER', date: '2011-12-30' },
] as const)(
  'preserves $dataset calendar date $date in UTC',
  async ({ dataset, date }) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(
        page([
          {
            ...feature(1),
            properties: {
              image_date: dataset === 'PRODES' ? date : '2000-01-01',
              view_date: dataset === 'DETER' ? date : '2000-01-01',
              year: 2000,
            },
          },
        ]),
      ),
    );
    const result = await new TerraBrasilisSource({
      datasets: [dataset],
      fetch,
    }).fetchEvents(input);
    expect(result.events[0]).toMatchObject({
      id: feature(1).id,
      geometry,
      dataset,
      observedAt: date,
      temporalPrecision: 'day',
      temporalBasis: 'observation',
    });
  },
);

it('preserves PRODES reporting years instead of inventing observation days', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(
      response(
        page([{ ...feature(1), properties: { image_date: null, year: 2021 } }]),
      ),
    );
  const result = await new TerraBrasilisSource({
    datasets: ['PRODES'],
    fetch,
  }).fetchEvents(input);
  expect(result.events[0]).toMatchObject({
    dataset: 'PRODES',
    observedAt: '2021',
    temporalPrecision: 'year',
    temporalBasis: 'prodes-year',
  });
  const url = new URL(String(fetch.mock.calls[0]![0]));
  expect(url.searchParams.get('typeName')).toBe(
    'prodes-legal-amz:yearly_deforestation',
  );
  expect(url.searchParams.get('sortBy')).toBe('fid');
});

it('queries both sources by default and never infers sufficient coverage from success', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => response(page([])));
  const result = await new TerraBrasilisSource({ fetch }).fetchEvents(input);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(result.sources.map((source) => source.dataset)).toEqual([
    'PRODES',
    'DETER',
  ]);
  expect(
    result.sources.every((source) => source.coverage.status === 'unknown'),
  ).toBe(true);
});

it('does not return partial analysis when one selected source fails', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response(page([])))
    .mockResolvedValueOnce(new Response('', { status: 503 }));
  await expect(
    new TerraBrasilisSource({ fetch }).fetchEvents(input),
  ).rejects.toThrow(EnvironmentalSourceUnavailableError);
});

it('archives exact response bytes and supplies a matching receipt', async () => {
  const onPage = vi.fn<(page: SourcePageEvidence) => Promise<void>>(
    async () => {},
  );
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(response(page([feature(1)])));
  const result = await new TerraBrasilisSource({
    datasets: ['DETER'],
    fetch,
    onPage,
  }).fetchEvents(input);
  expect(onPage).toHaveBeenCalledWith(
    expect.objectContaining({
      body: JSON.stringify(page([feature(1)])),
      method: 'GET',
      payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
  expect(result.sources[0]!.pages[0]!.payloadHash).toBe(
    createHash('sha256')
      .update(JSON.stringify(page([feature(1)])))
      .digest('hex'),
  );
  expect(result.sources[0]!.pages[0]!.payloadHash).toBe(
    onPage.mock.calls[0]?.[0]?.payloadHash,
  );
});

it.each(['archive', 'receipt'] as const)(
  'preserves the original local %s error',
  async (stage) => {
    const error = new Error('Local evidence storage failed');
    const fail = async () => {
      throw error;
    };
    const source = new TerraBrasilisSource({
      datasets: ['DETER'],
      fetch: async () => response(page([])),
      ...(stage === 'archive' ? { onPage: fail } : {}),
    });
    await expect(
      source.fetchEvents({
        ...input,
        ...(stage === 'receipt' ? { onPage: fail } : {}),
      }),
    ).rejects.toBe(error);
  },
);

it('archives malformed response bytes before reporting a source protocol failure', async () => {
  const onPage = vi.fn<(page: SourcePageEvidence) => Promise<void>>(
    async () => {},
  );
  const source = new TerraBrasilisSource({
    datasets: ['DETER'],
    fetch: async () => new Response('not-json'),
    onPage,
  });
  await expect(source.fetchEvents(input)).rejects.toThrow(
    EnvironmentalSourceUnavailableError,
  );
  expect(onPage).toHaveBeenCalledWith(
    expect.objectContaining({ body: 'not-json' }),
  );
});

it('uses form POST for long geometries while preserving the complete spatial filter', async () => {
  const ring = Array.from({ length: 600 }, (_, index) => [
    -55 + 0.1 * Math.cos((index / 600) * Math.PI * 2),
    -12 + 0.1 * Math.sin((index / 600) * Math.PI * 2),
  ]);
  ring.push(ring[0]!);
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(response(page([])));
  await new TerraBrasilisSource({ datasets: ['DETER'], fetch }).fetchEvents({
    ...input,
    geometry: { type: 'Polygon', coordinates: [ring] },
  });
  expect(fetch.mock.calls[0]![1]).toMatchObject({
    method: 'POST',
    headers: expect.objectContaining({
      'content-type': 'application/x-www-form-urlencoded',
    }),
  });
  const body = new URLSearchParams(String(fetch.mock.calls[0]![1]!.body));
  expect(body.get('CQL_FILTER')).toContain(ring[200]!.join(' '));
  expect(body.get('typeName')).toBe('deter-amz:deter_amz');
});

it('rejects a CRS mismatch rather than relabelling returned coordinates', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    response({
      ...page([feature(1)]),
      crs: { type: 'name', properties: { name: 'EPSG:3857' } },
    }),
  );
  await expect(
    new TerraBrasilisSource({ datasets: ['DETER'], fetch }).fetchEvents(input),
  ).rejects.toThrow(EnvironmentalSourceUnavailableError);
});
