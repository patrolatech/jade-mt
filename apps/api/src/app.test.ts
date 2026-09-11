import { afterEach, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  EnvironmentalSourceUnavailableError,
  TerraBrasilisSource,
} from '@jade/environmental-oracle';
import { ResearchNotImplementedError } from '@jade/schemas';
import { buildApp } from './app.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const payload = {
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  },
  commodity: 'soy',
  cutoffDate: '2020-12-31',
};

async function setup(fetchEvents = vi.fn(async () => [])) {
  const app = await buildApp({
    config: {
      databaseUrl: '',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'silent',
    },
    validationDependencies: {
      source: { fetchEvents },
      geometryRepository: { analyzeIntersection: vi.fn() },
    },
  });
  apps.push(app);
  return { app, fetchEvents };
}

it('starts and exposes health without live external dependencies in unit tests', async () => {
  const { app } = await setup();
  expect((await app.inject({ method: 'GET', url: '/health' })).json()).toEqual({
    status: 'ok',
    service: 'jade-api',
  });
});

it.each([
  { ...payload, cutoffDate: '2020-02-30' },
  { ...payload, geometry: { type: 'Polygon', coordinates: 'invalid' } },
  { ...payload, geometry: { type: 'Polygon', coordinates: [[[0, 0]]] } },
  { ...payload, commodity: 123 },
  { ...payload, commodity: '   ' },
  { ...payload, unexpected: true },
])(
  'rejects invalid request structure before calling the oracle (%j)',
  async (invalidPayload) => {
    const { app, fetchEvents } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/validations',
      payload: invalidPayload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetchEvents).not.toHaveBeenCalled();
  },
);

it('calls the oracle and reports the pending methodology explicitly', async () => {
  const { app, fetchEvents } = await setup();
  const response = await app.inject({
    method: 'POST',
    url: '/validations',
    payload,
  });
  expect(response.statusCode).toBe(501);
  expect(response.json()).toMatchObject({ code: 'RESEARCH_NOT_IMPLEMENTED' });
  expect(fetchEvents).toHaveBeenCalledOnce();
  expect(response.json()).not.toHaveProperty('status');
});

it('reports unconfigured source separately from an empty source', async () => {
  const source = new TerraBrasilisSource();
  const { app } = await setup(
    vi.fn().mockImplementation((input) => source.fetchEvents(input)),
  );
  const response = await app.inject({
    method: 'POST',
    url: '/validations',
    payload,
  });
  expect(response.statusCode).toBe(501);
  expect(response.json().message).toContain('TerraBrasilis');
});

it.each([
  [new EnvironmentalSourceUnavailableError(), 503, 'SOURCE_UNAVAILABLE'],
  [new ResearchNotImplementedError('CRS'), 501, 'RESEARCH_NOT_IMPLEMENTED'],
  [new Error('private connection credentials'), 500, 'INTERNAL_ERROR'],
] as const)(
  'maps operational errors without fabricating a screening result',
  async (error, status, code) => {
    const { app } = await setup(vi.fn().mockRejectedValue(error));
    const response = await app.inject({
      method: 'POST',
      url: '/validations',
      payload,
    });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ code });
    expect(response.body).not.toContain('private connection credentials');
  },
);

it('serializes shared result schemas when an explicit test decision is supplied', async () => {
  const app = await buildApp({
    config: {
      databaseUrl: '',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'silent',
    },
    validationDependencies: {
      source: { fetchEvents: async () => [] },
      geometryRepository: { analyzeIntersection: vi.fn() },
      decisionRule: () => 'INCONCLUSIVE',
    },
  });
  apps.push(app);
  const response = await app.inject({
    method: 'POST',
    url: '/validations',
    payload,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    status: 'INCONCLUSIVE',
    eventsFound: 0,
    eventAnalyses: [],
  });
  expect(response.json().validationId).toMatch(/^[a-f0-9-]{36}$/);
});
