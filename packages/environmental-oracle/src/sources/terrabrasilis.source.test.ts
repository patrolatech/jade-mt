import { expect, it, vi } from 'vitest';
import { ResearchNotImplementedError } from '@jade/schemas';
import {
  TerraBrasilisSource,
  buildGenericWfsRequest,
} from './terrabrasilis.source.js';
import { EnvironmentalSourceUnavailableError } from './environmental-source.js';

it('only adds generic WFS parameters', () => {
  const url = buildGenericWfsRequest('https://example.invalid/wfs');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    outputFormat: 'application/json',
  });
});

it('uses injectable native-fetch transport without claiming event mapping is complete', async () => {
  const payload = { type: 'FeatureCollection', features: [] };
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(Response.json(payload));
  const source = new TerraBrasilisSource({
    endpoint: 'https://example.invalid/wfs',
    fetch,
  });
  expect(await source.fetchFeatureCollection()).toEqual(payload);
  expect(fetch).toHaveBeenCalledOnce();
  await expect(
    source.fetchEvents({
      geometry: { type: 'Point', coordinates: [0, 0] },
      cutoffDate: new Date('2020-12-31'),
    }),
  ).rejects.toThrow(ResearchNotImplementedError);
  expect(fetch).toHaveBeenCalledOnce();
});

it('does not fetch a guessed endpoint', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  await expect(
    new TerraBrasilisSource({ fetch }).fetchFeatureCollection(),
  ).rejects.toThrow(ResearchNotImplementedError);
  expect(fetch).not.toHaveBeenCalled();
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
        endpoint: 'https://example.invalid/wfs',
        fetch,
      }).fetchFeatureCollection(),
    ).rejects.toThrow(EnvironmentalSourceUnavailableError);
  },
);
