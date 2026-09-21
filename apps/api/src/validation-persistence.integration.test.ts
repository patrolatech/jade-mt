import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createDatabasePool,
  PostgisValidationRepository,
} from '@jade/database';
import type { StoredValidation, ValidationResult } from '@jade/schemas';
import { buildApp } from './app.js';

// HTTP writes must really commit to test retrieval after restart and concurrent
// transactions. Use a disposable database, never DELETE/TRUNCATE audit history.
const databaseName = `jade_api_test_${randomBytes(6).toString('hex')}`;
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
  property_id: 'farm-1',
  plot_id: 'plot-1',
};
const features = [
  {
    type: 'Feature',
    id: 'yearly_deforestation.1',
    geometry: polygon,
    properties: { year: 2024 },
  },
  {
    type: 'Feature',
    id: 'yearly_deforestation.2',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-55.6, -12],
          [-55.4, -11.8],
          [-55.4, -12],
          [-55.6, -11.8],
          [-55.6, -12],
        ],
      ],
    },
    properties: { image_date: '2024-01-15' },
  },
];
function page(items: unknown[], total = items.length) {
  return new Response(
    JSON.stringify({
      type: 'FeatureCollection',
      numberMatched: total,
      numberReturned: items.length,
      crs: { type: 'name', properties: { name: 'EPSG:4326' } },
      features: items,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}
const fetchMock = vi.fn<typeof fetch>();

beforeAll(async () => {
  await admin.query(`CREATE DATABASE ${databaseName}`);
  created = true;
  directory = await mkdtemp(join(tmpdir(), 'jade-api-persistence-'));
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

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url) => {
    const index = Number(new URL(String(url)).searchParams.get('startIndex'));
    return page(features.slice(index, index + 1), features.length);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await pool.end();
  if (created) await admin.query(`DROP DATABASE ${databaseName}`);
  await admin.end();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function application() {
  const app = await buildApp({
    config: {
      databaseUrl: testUrl.href,
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'silent',
      datasets: ['PRODES'],
      sourceEvidenceDirectory: directory,
    },
  });
  apps.push(app);
  return app;
}
async function submit(app: FastifyInstance, input = payload) {
  return app.inject({ method: 'POST', url: '/validations', payload: input });
}
async function stored(app: FastifyInstance, id: string) {
  const response = await app.inject({
    method: 'GET',
    url: `/validations/${id}`,
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<StoredValidation>();
}

it('commits exact input/result, source pages, measurements and invalid geometries, then retrieves them after restart', async () => {
  const app = await application();
  const response = await submit(app);
  expect(response.statusCode, response.body).toBe(200);
  const result = response.json<ValidationResult>();
  expect(result.eventsFound).toBe(2);
  expect(result.status).toBe('INCONCLUSIVE');
  expect(result.eventAnalyses).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await app.close();
  const restarted = await application();
  const saved = await stored(restarted, result.validationId);
  expect(saved).toMatchObject({
    executionStatus: 'completed',
    input: payload,
    result,
    error: null,
  });
  expect(saved.processingVersion).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(saved.runtimeVersions.postgis).toContain('POSTGIS=');
  expect(saved.finishedAt).not.toBeNull();
  expect(saved.evidence).toHaveLength(2);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const { rows } = await pool.query(
    `SELECT f.analysis_status, f.intersection_area_m2, v.geom IS NULL AS missing_geometry,
      v.temporal_basis, v.temporal_precision, v.period_start, v.period_end, v.temporal_label,
      v.record_locator, p.payload_hash, a.storage_key, a.byte_length
     FROM validation_runs r JOIN validation_findings f ON f.validation_run_id = r.id
     JOIN observation_versions v ON v.id = f.observation_version_id
     JOIN ingestion_pages p ON p.id = v.ingestion_page_id
     JOIN evidence_artifacts a ON a.payload_hash = p.payload_hash
     WHERE r.public_id = $1 ORDER BY f.analysis_status`,
    [result.validationId],
  );
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    analysis_status: 'invalid_geometry',
    intersection_area_m2: null,
    missing_geometry: true,
    temporal_basis: 'observation',
    temporal_precision: 'day',
  });
  expect(rows[1]).toMatchObject({
    analysis_status: 'measured',
    missing_geometry: false,
    temporal_basis: 'reporting_period',
    temporal_precision: 'year',
    temporal_label: '2024',
    period_start: null,
    period_end: null,
  });
  for (const row of rows) {
    expect(row.record_locator).toBe('/features/0');
    const bytes = await readFile(join(directory, row.storage_key));
    expect(String(bytes.byteLength)).toBe(row.byte_length);
    expect(
      saved.evidence.some(
        (receipt) => receipt.payloadHash === row.payload_hash,
      ),
    ).toBe(true);
  }
});

it('preserves an empty response as evidence instead of inventing observations', async () => {
  fetchMock.mockImplementation(async () => page([]));
  const app = await application();
  const response = await submit(app);
  expect(response.statusCode, response.body).toBe(200);
  const result = response.json<ValidationResult>();
  const saved = await stored(app, result.validationId);
  expect(saved.result?.eventsFound).toBe(0);
  expect(saved.result?.sources[0]?.pages[0]?.returned).toBe(0);
  expect(saved.evidence).toHaveLength(1);
  const sources = await pool.query(
    `SELECT i.returned_records, i.sealed_at FROM validation_run_sources s
     JOIN validation_runs r ON r.id = s.validation_run_id
     JOIN ingestion_runs i ON i.id = s.ingestion_run_id WHERE r.public_id = $1`,
    [result.validationId],
  );
  expect(sources.rows[0].returned_records).toBe('0');
  expect(sources.rows[0].sealed_at).not.toBeNull();
});

it('records source failure, retaining pages already received and a recoverable validation ID', async () => {
  fetchMock.mockImplementation(async (url) => {
    if (new URL(String(url)).searchParams.get('startIndex') === '0')
      return page([features[0]], 2);
    throw new Error('simulated upstream failure');
  });
  const app = await application();
  const response = await submit(app);
  expect(response.statusCode, response.body).toBe(503);
  const error = response.json();
  expect(error.code).toBe('SOURCE_UNAVAILABLE');
  const saved = await stored(app, error.validationId);
  expect(saved).toMatchObject({
    executionStatus: 'failed',
    result: null,
    input: payload,
    error,
  });
  expect(saved.evidence).toHaveLength(1);
});

it('keeps concurrent runs separate and allocates immutable revisions without duplicate source identities', async () => {
  const app = await application();
  const responses = await Promise.all([
    submit(app),
    submit(app, { ...payload, commodity: 'coffee' }),
  ]);
  for (const response of responses)
    expect(response.statusCode, response.body).toBe(200);
  const ids = responses.map(
    (response) => response.json<ValidationResult>().validationId,
  );
  expect(ids[0]).not.toBe(ids[1]);
  const records = await Promise.all(ids.map((id) => stored(app, id)));
  expect(records.map((item) => item.input.commodity)).toEqual([
    'soy',
    'coffee',
  ]);
  const { rows } = await pool.query(
    `SELECT r.public_id, f.observation_version_id, v.observation_id, f.ingestion_run_id
     FROM validation_runs r JOIN validation_findings f ON f.validation_run_id = r.id
     JOIN observation_versions v ON v.id = f.observation_version_id
     WHERE r.public_id = ANY($1::uuid[])`,
    [ids],
  );
  expect(rows).toHaveLength(4);
  expect(new Set(rows.map((row) => row.observation_version_id)).size).toBe(4);
  expect(new Set(rows.map((row) => row.observation_id)).size).toBe(2);
  expect(new Set(rows.map((row) => row.ingestion_run_id)).size).toBe(2);
});

it('rolls back a failed finalization and never returns HTTP 200 for an unsaved result', async () => {
  const original = PostgisValidationRepository.prototype.complete;
  vi.spyOn(
    PostgisValidationRepository.prototype,
    'complete',
  ).mockImplementation(function (
    this: PostgisValidationRepository,
    result,
    events,
    evidence,
  ) {
    return original.call(
      this,
      {
        ...result,
        eventAnalyses: result.eventAnalyses.map((item) => ({
          ...item,
          analysis: { ...item.analysis, intersectionPercentage: 101 },
        })),
      },
      events,
      evidence,
    );
  });
  const app = await application();
  const response = await submit(app);
  expect(response.statusCode, response.body).toBe(500);
  const error = response.json();
  const saved = await stored(app, error.validationId);
  expect(saved).toMatchObject({
    executionStatus: 'failed',
    result: null,
    error,
  });
  expect(saved.evidence).toHaveLength(2);
  const { rows } = await pool.query(
    `SELECT (SELECT count(*) FROM validation_findings WHERE validation_run_id = r.id) AS findings,
      (SELECT count(*) FROM validation_run_sources WHERE validation_run_id = r.id) AS sources
     FROM validation_runs r WHERE r.public_id = $1`,
    [error.validationId],
  );
  expect(rows[0]).toEqual({ findings: '0', sources: '0' });
});

it('rejects invalid inputs before recording a run, and distinguishes invalid IDs from missing IDs', async () => {
  const app = await application();
  const before = await pool.query('SELECT count(*) FROM validation_runs');
  const invalid = await app.inject({
    method: 'POST',
    url: '/validations',
    payload: {
      ...payload,
      geometry: features[1]!.geometry,
    },
  });
  expect(invalid.statusCode).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(
    (await pool.query('SELECT count(*) FROM validation_runs')).rows,
  ).toEqual(before.rows);
  expect(
    (await app.inject({ method: 'GET', url: '/validations/invalid-id' }))
      .statusCode,
  ).toBe(400);
  expect(
    (await app.inject({ method: 'GET', url: `/validations/${randomUUID()}` }))
      .statusCode,
  ).toBe(404);
});
