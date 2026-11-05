import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createDatabasePool,
  PostgisGeometryRepository,
  PostgisValidationRepository,
} from '@jade/database';
import {
  EnvironmentalSourceUnavailableError,
  evaluateDecisionProposal,
  type EnvironmentalSource,
  type EnvironmentalSourceResult,
} from '@jade/environmental-oracle';
import type { EnvironmentalEvent, SourceReport } from '@jade/schemas';
import { buildApp } from './app.js';
import {
  archiveSourcePage,
  describeSourcePage,
} from './plugins/source-evidence.js';
import { processingVersion } from './plugins/processing-version.js';

// Controlled A/B/C/D cases with real PostGIS geometry and explicit decision
// rule injection. Synthetic fixtures declare occurrence semantics; real WFS
// dates are never reclassified. Production API remains DRAFT/INCONCLUSIVE.
const databaseName = `jade_api_decision_${randomBytes(6).toString('hex')}`;
const adminUrl =
  process.env.DATABASE_URL ?? 'postgresql://jade:jade_dev@127.0.0.1:5432/jade';
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${databaseName}`;
const admin = createDatabasePool(adminUrl);
const pool = createDatabasePool(testUrl.href);
const apps: FastifyInstance[] = [];
let directory: string;
let created = false;

const polygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-55.6, -12],
      [-55.4, -12],
      [-55.4, -11.8],
      [-55.6, -11.8],
      [-55.6, -12],
    ],
  ],
};
const payload = {
  geometry: polygon,
  commodity: 'soy',
  cutoffDate: '2020-12-31',
};

const fixtureBody = JSON.stringify({ synthetic: 'controlled-test' });
const fixturePayloadHash = createHash('sha256')
  .update(fixtureBody)
  .digest('hex');

function syntheticSource(
  events: EnvironmentalEvent[],
  coverage: SourceReport['coverage'],
): EnvironmentalSource {
  return {
    fetchEvents: async (input): Promise<EnvironmentalSourceResult> => {
      const bodyBytes = Buffer.from(fixtureBody, 'utf8');
      const page = {
        requestUrl: 'https://synthetic.test/fixture',
        method: 'GET' as const,
        retrievedAt: new Date().toISOString(),
        payloadHash: fixturePayloadHash,
        body: fixtureBody,
        bodyBytes,
      };
      await archiveSourcePage(directory)(page);
      await input.onPage?.(page);
      const sources: SourceReport[] = [
        {
          provider: 'synthetic',
          dataset: 'fixture',
          layer: 'fixture',
          crs: 'EPSG:4326',
          cutoffDate: payload.cutoffDate,
          datasetVersion: 'controlled-test',
          adapter: { name: 'synthetic', version: 'test/1' },
          matchedEvents: events.length,
          pages: [
            {
              requestUrl: page.requestUrl,
              method: page.method,
              retrievedAt: page.retrievedAt,
              payloadHash: page.payloadHash,
              returned: events.length,
            },
          ],
          coverage,
        },
      ];
      return { events, sources };
    },
  };
}

function event(
  id: string,
  geometry: EnvironmentalEvent['geometry'],
  observedAt: string | null,
  temporalBasis: EnvironmentalEvent['temporalBasis'] = 'occurrence',
  temporalPrecision: EnvironmentalEvent['temporalPrecision'] = 'day',
): EnvironmentalEvent {
  return {
    id,
    provider: 'synthetic',
    dataset: 'fixture',
    geometry,
    observedAt,
    temporalPrecision,
    temporalBasis,
    provenance: {
      layer: 'fixture',
      payloadHash: fixturePayloadHash,
      recordLocator: `/features/${id}`,
      normalizerVersion: 'test/1',
    },
  };
}

const sufficientCoverage: SourceReport['coverage'] = {
  status: 'sufficient',
  reason: 'Synthetic complete controlled universe',
};

beforeAll(async () => {
  await admin.query(`CREATE DATABASE ${databaseName}`);
  created = true;
  directory = await mkdtemp(join(tmpdir(), 'jade-api-decision-'));
  const migrations = new URL(
    '../../../packages/database/migrations/',
    import.meta.url,
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const file of (await readdir(migrations))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      await client.query(await readFile(new URL(file, migrations), 'utf8'));
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}, 30_000);

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});
afterAll(async () => {
  await pool.end();
  if (created) await admin.query(`DROP DATABASE ${databaseName}`);
  await admin.end();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function application(source: EnvironmentalSource) {
  const app = await buildApp({
    config: {
      databaseUrl: testUrl.href,
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'silent',
    },
    validationDependencies: {
      source,
      geometryRepository: new PostgisGeometryRepository(pool),
      decisionRule: evaluateDecisionProposal,
    },
    validationPersistence: {
      repository: new PostgisValidationRepository(
        pool,
        await processingVersion(),
      ),
      describePage: describeSourcePage(directory),
    },
  });
  apps.push(app);
  return app;
}

async function submit(app: FastifyInstance, input = payload) {
  return app.inject({ method: 'POST', url: '/validations', payload: input });
}

it('A — no positive intersection with sufficient coverage → PASS', async () => {
  const disjoint: EnvironmentalEvent['geometry'] = {
    type: 'Polygon',
    coordinates: [
      [
        [-54, -11],
        [-53.8, -11],
        [-53.8, -10.8],
        [-54, -10.8],
        [-54, -11],
      ],
    ],
  };
  const app = await application(
    syntheticSource(
      [event('disjoint-1', disjoint, '2021-01-01')],
      sufficientCoverage,
    ),
  );
  const response = await submit(app);
  expect(response.statusCode, response.body).toBe(200);
  const result = response.json();
  expect(result.status).toBe('PASS');
  expect(result.eventAnalyses[0].analysis.intersectionAreaM2).toBe(0);
});

it('B — positive intersection with occurrence before cutoff → PASS', async () => {
  const app = await application(
    syntheticSource(
      [event('overlap-before', polygon, '2020-01-01')],
      sufficientCoverage,
    ),
  );
  const response = await submit(app);
  expect(response.statusCode, response.body).toBe(200);
  const result = response.json();
  expect(result.status).toBe('PASS');
  expect(result.eventAnalyses[0].analysis.intersectionAreaM2).toBeGreaterThan(
    0,
  );
});

it('C — positive intersection with occurrence after cutoff → FAIL', async () => {
  const app = await application(
    syntheticSource(
      [event('overlap-after', polygon, '2021-06-15')],
      sufficientCoverage,
    ),
  );
  const response = await submit(app);
  expect(response.statusCode, response.body).toBe(200);
  const result = response.json();
  expect(result.status).toBe('FAIL');
  expect(result.eventAnalyses[0].analysis.intersectionAreaM2).toBeGreaterThan(
    0,
  );
});

it('D1 — unknown coverage → INCONCLUSIVE', async () => {
  const app = await application(
    syntheticSource([event('overlap-before', polygon, '2020-01-01')], {
      status: 'unknown',
      reason: 'Coverage not established',
    }),
  );
  const response = await submit(app);
  expect(response.statusCode, response.body).toBe(200);
  const result = response.json();
  expect(result.status).toBe('INCONCLUSIVE');
  expect(
    result.issues?.some(
      (i: { code: string }) => i.code === 'INSUFFICIENT_COVERAGE',
    ),
  ).toBe(true);
});

it('D2 — uncertain temporal basis (observation, unknown precision) → INCONCLUSIVE', async () => {
  const app = await application(
    syntheticSource(
      [event('overlap-uncertain', polygon, null, 'unknown', 'unknown')],
      sufficientCoverage,
    ),
  );
  const response = await submit(app);
  expect(response.statusCode, response.body).toBe(200);
  const result = response.json();
  expect(result.status).toBe('INCONCLUSIVE');
});

it('D3 — source failure → 503, no partial environmental decision', async () => {
  const failingSource: EnvironmentalSource = {
    fetchEvents: vi
      .fn()
      .mockRejectedValue(new EnvironmentalSourceUnavailableError()),
  };
  const app = await application(failingSource);
  const response = await submit(app);
  expect(response.statusCode).toBe(503);
  const error = response.json();
  expect(error.code).toBe('SOURCE_UNAVAILABLE');
  expect(error.validationId).toBeDefined();
});
