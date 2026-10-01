import { afterEach, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  EnvironmentalSourceUnavailableError,
  TerraBrasilisSource,
} from '@jade/environmental-oracle';
import { ResearchNotImplementedError } from '@jade/schemas';
import { InvalidGeometryError } from '@jade/database';
import { buildApp } from './app.js';
import { ValidationExecutionError } from './modules/validations/validation.service.js';

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

async function setup(
  fetchEvents = vi.fn(async () => ({ events: [], sources: [] })),
) {
  const app = await buildApp({
    config: {
      databaseUrl: '',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'silent',
    },
    validationDependencies: {
      source: { fetchEvents },
      geometryRepository: {
        validateProperty: vi.fn(async () => {}),
        analyzeIntersection: vi.fn(),
      },
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
  { ...payload, geometry: { type: 'Point', coordinates: [0, 0] } },
  { ...payload, geometry: { type: 'MultiPolygon', coordinates: [] } },
  {
    ...payload,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [999, 0],
          [1000, 0],
          [1000, 1],
          [999, 0],
        ],
      ],
    },
  },
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

it('calls the oracle and returns screening result when source works', async () => {
  const { app, fetchEvents } = await setup();
  const response = await app.inject({
    method: 'POST',
    url: '/validations',
    payload,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    status: 'INCONCLUSIVE',
    methodologyStatus: 'draft',
    eventsFound: 0,
    methodology: { id: 'JADE-ENV', version: '0.1' },
  });
  expect(fetchEvents).toHaveBeenCalledOnce();
});

it('reports local archive failures as internal errors without exposing storage details', async () => {
  const source = new TerraBrasilisSource({
    datasets: ['DETER'],
    fetch: async () =>
      new Response(
        JSON.stringify({
          type: 'FeatureCollection',
          crs: { type: 'name', properties: { name: 'EPSG:4326' } },
          features: [],
          numberMatched: 0,
          numberReturned: 0,
        }),
      ),
    onPage: async () => {
      throw new Error('ENOSPC: private archive path');
    },
  });
  const { app } = await setup(
    vi.fn().mockImplementation((input) => source.fetchEvents(input)),
  );
  const response = await app.inject({
    method: 'POST',
    url: '/validations',
    payload,
  });
  expect(response.statusCode).toBe(500);
  expect(response.json()).toEqual({
    code: 'INTERNAL_ERROR',
    message: 'Validation could not be completed',
  });
});

it.each([
  [new EnvironmentalSourceUnavailableError(), 503, 'SOURCE_UNAVAILABLE'],
  [new ResearchNotImplementedError('CRS'), 501, 'RESEARCH_NOT_IMPLEMENTED'],
  [
    new InvalidGeometryError('property', 'Self-intersection'),
    400,
    'INVALID_REQUEST',
  ],
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

it.each([
  [new EnvironmentalSourceUnavailableError(), 503, 'SOURCE_UNAVAILABLE'],
  [new ResearchNotImplementedError('CRS'), 501, 'RESEARCH_NOT_IMPLEMENTED'],
  [
    new InvalidGeometryError('property', 'private detail'),
    500,
    'INTERNAL_ERROR',
  ],
  [new Error('private detail'), 500, 'INTERNAL_ERROR'],
] as const)(
  'preserves execution IDs and sanitizes errors after a validation starts',
  async (cause, status, code) => {
    const validationId = 'a42db300-96a5-4f94-a6b1-17845b4b1774';
    const { app } = await setup(
      vi
        .fn()
        .mockRejectedValue(new ValidationExecutionError(validationId, cause)),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/validations',
      payload,
    });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ code, validationId });
    expect(response.body).not.toContain('private detail');
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
      source: { fetchEvents: async () => ({ events: [], sources: [] }) },
      geometryRepository: {
        validateProperty: vi.fn(async () => {}),
        analyzeIntersection: vi.fn(),
      },
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

it('returns an inconclusive result with the affected event ID when its geometry is invalid', async () => {
  const app = await buildApp({
    config: {
      databaseUrl: '',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'silent',
    },
    validationDependencies: {
      source: {
        fetchEvents: async () => ({
          sources: [],
          events: [
            {
              id: 'deter_amz.123',
              provider: 'INPE',
              dataset: 'DETER',
              geometry: { type: 'Polygon', coordinates: [] },
              observedAt: '2021-01-01',
              temporalPrecision: 'day',
            },
          ],
        }),
      },
      geometryRepository: {
        validateProperty: vi.fn(async () => {}),
        analyzeIntersection: vi
          .fn()
          .mockRejectedValue(
            new InvalidGeometryError('event', 'Self-intersection[-59 -9]'),
          ),
      },
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
    eventsFound: 1,
    eventAnalyses: [],
    issues: expect.arrayContaining([
      {
        code: 'INVALID_EVENT_GEOMETRY',
        eventId: 'deter_amz.123',
        message: 'Self-intersection[-59 -9]',
      },
    ]),
  });
});

it('accepts external property/plot references and returns explicit draft/coverage issues', async () => {
  const { app } = await setup();
  const response = await app.inject({
    method: 'POST',
    url: '/validations',
    payload: { ...payload, property_id: 'property-1', plot_id: 'plot-2' },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    methodologyStatus: 'draft',
    status: 'INCONCLUSIVE',
    issues: expect.arrayContaining([
      expect.objectContaining({ code: 'METHODOLOGY_PENDING_APPROVAL' }),
      expect.objectContaining({ code: 'INSUFFICIENT_COVERAGE' }),
    ]),
  });
});

it.each([
  {
    ...payload.geometry,
    crs: { type: 'name', properties: { name: 'EPSG:3857' } },
  },
  {
    ...payload.geometry,
    coordinates: [
      [
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 0, 1],
      ],
    ],
  },
])(
  'rejects implicit reprojection or altitude in input geometry',
  async (geometry) => {
    const { app, fetchEvents } = await setup();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/validations',
          payload: { ...payload, geometry },
        })
      ).statusCode,
    ).toBe(400);
    expect(fetchEvents).not.toHaveBeenCalled();
  },
);

it('enforces the transport size limit before invoking the source', async () => {
  const { app, fetchEvents } = await setup();
  const response = await app.inject({
    method: 'POST',
    url: '/validations',
    payload: { ...payload, property_id: 'x'.repeat(1_048_576) },
  });
  expect(response.statusCode).toBe(413);
  expect(fetchEvents).not.toHaveBeenCalled();
});
