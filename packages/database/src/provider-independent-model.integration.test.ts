import { createHash, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { createDatabasePool } from './pool.js';

const pool = createDatabasePool(
  process.env.DATABASE_URL ?? 'postgresql://jade:jade_dev@127.0.0.1:5432/jade',
);
let client: PoolClient;
const polygon =
  'POLYGON((-55.6 -12,-55.4 -12,-55.4 -11.8,-55.6 -11.8,-55.6 -12))';

beforeEach(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
});
afterEach(async () => {
  await client.query('ROLLBACK');
  client.release();
});
afterAll(async () => pool.end());

async function rejected(sql: string, values: unknown[], code = '23514') {
  await client.query('SAVEPOINT rejected_statement');
  try {
    await expect(client.query(sql, values)).rejects.toMatchObject({ code });
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT rejected_statement');
    await client.query('RELEASE SAVEPOINT rejected_statement');
  }
}

async function area() {
  const { rows } = await client.query<{ id: string; area_id: string }>(
    `WITH area AS (INSERT INTO areas(kind) VALUES ('analysis_area') RETURNING id)
     INSERT INTO area_versions(area_id, version, geom)
     SELECT id, 1, ST_GeomFromText($1, 4326) FROM area RETURNING id, area_id`,
    [polygon],
  );
  return rows[0]!;
}

async function source() {
  const sourceResult = await client.query<{ id: string }>(
    'INSERT INTO data_sources(provider_key, dataset_key) VALUES ($1, $2) RETURNING id',
    [`fixture-${randomBytes(8).toString('hex')}`, 'environmental-observations'],
  );
  const sourceId = sourceResult.rows[0]!.id;
  const hash = createHash('sha256').update(sourceId).digest('hex');
  const recordResult = await client.query<{ id: string }>(
    `INSERT INTO source_records(source_id, external_id) VALUES ($1, 'same-external-id') RETURNING id`,
    [sourceId],
  );
  await client.query(
    `INSERT INTO evidence_artifacts(payload_hash, storage_key, media_type, byte_length)
     VALUES ($1, $2, 'text/plain', $3)`,
    [hash, `fixtures/${hash}`, Buffer.byteLength(sourceId)],
  );
  const ingestionResult = await client.query<{ id: string }>(
    `INSERT INTO ingestion_runs(source_id, adapter_name, adapter_version, request_context,
      status, matched_records, returned_records, started_at, finished_at)
     VALUES ($1, 'fixture', '1', '{}', 'complete', 1, 1, now(), now()) RETURNING id`,
    [sourceId],
  );
  const ingestionId = ingestionResult.rows[0]!.id;
  const pageResult = await client.query<{ id: string }>(
    `INSERT INTO ingestion_pages(ingestion_run_id, source_id, page_number, payload_hash,
      request_uri, request_method, retrieved_at, returned_records)
     VALUES ($1, $2, 1, $3, 'https://fixture.invalid/data', 'GET', now(), 1) RETURNING id`,
    [ingestionId, sourceId, hash],
  );
  const pageId = pageResult.rows[0]!.id;
  const observationResult = await client.query<{ id: string }>(
    `INSERT INTO environmental_observations(source_record_id, source_id) VALUES ($1, $2) RETURNING id`,
    [recordResult.rows[0]!.id, sourceId],
  );
  const observationId = observationResult.rows[0]!.id;
  const versionResult = await client.query<{ id: string }>(
    `INSERT INTO observation_versions(observation_id, version, source_id, ingestion_run_id,
      ingestion_page_id, record_locator, normalizer_version, geom, temporal_basis, temporal_precision, temporal_label)
     VALUES ($1, 1, $2, $3, $4, '/features/0', '1', ST_GeomFromText($5, 4326), 'reporting_period', 'year', '2024') RETURNING id`,
    [observationId, sourceId, ingestionId, pageId, polygon],
  );
  return {
    source: sourceId,
    record: recordResult.rows[0]!.id,
    ingestion: ingestionId,
    page: pageId,
    observation: observationId,
    version: versionResult.rows[0]!.id,
  };
}

async function validation(areaVersionId: string) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO validation_runs(area_version_id, commodity, cutoff_date, methodology_id,
      methodology_version, processing_version)
     VALUES ($1, 'soy', '2020-12-31', 'JADE-ENV', '0.1', 'fixture-1') RETURNING id`,
    [areaVersionId],
  );
  return rows[0]!.id;
}

async function attach(run: string, ingestion: string) {
  await client.query(
    `INSERT INTO validation_run_sources(validation_run_id, ingestion_run_id, coverage_status, coverage_reason)
     VALUES ($1, $2, 'unknown', 'Transport success does not establish coverage')`,
    [run, ingestion],
  );
}

const insertFinding = `INSERT INTO validation_findings(validation_run_id, observation_version_id,
  ingestion_run_id, analysis_status, intersection_area_m2, intersection_percentage)
  VALUES ($1, $2, $3, 'measured', $4, $5)`;

it('generates numeric identities in PostgreSQL and rejects accidental caller-supplied primary keys', async () => {
  const first = await area();
  const second = await area();
  expect(first.area_id).toMatch(/^[1-9][0-9]*$/);
  expect(BigInt(second.area_id)).toBeGreaterThan(BigInt(first.area_id));
  await rejected(
    `INSERT INTO areas(id, kind) VALUES ($1, 'analysis_area')`,
    ['9000000'],
    '428C9',
  );
});

it('round-trips bigint identities and foreign keys above the JavaScript safe integer limit without rounding', async () => {
  const largeId = '9007199254740993';
  // Explicit override isolates the precision boundary without changing a shared sequence.
  await client.query(
    `INSERT INTO areas(id, kind) OVERRIDING SYSTEM VALUE VALUES ($1, 'analysis_area')`,
    [largeId],
  );
  const { rows } = await client.query<{ id: string; area_id: string }>(
    `INSERT INTO area_versions(id, area_id, version, geom) OVERRIDING SYSTEM VALUE
     VALUES ($1, $1, 1, ST_GeomFromText($2, 4326)) RETURNING id, area_id`,
    [largeId, polygon],
  );
  expect(rows[0]).toEqual({ id: largeId, area_id: largeId });
  const run = await validation(rows[0]!.id);
  const result = await client.query<{ area_version_id: string }>(
    'SELECT area_version_id FROM validation_runs WHERE id = $1',
    [run],
  );
  expect(result.rows[0]!.area_version_id).toBe(largeId);
  expect(JSON.stringify(result.rows[0])).toBe(
    `{"area_version_id":"${largeId}"}`,
  );
});

it('keeps a completed result pinned to its original geometry, observation and evidence after new revisions', async () => {
  const a = await area();
  const s = await source();
  const run = await validation(a.id);
  await attach(run, s.ingestion);
  await client.query(insertFinding, [run, s.version, s.ingestion, 10, 1]);
  await client.query(
    `UPDATE validation_runs SET execution_status = 'completed', status = 'INCONCLUSIVE', finished_at = now() WHERE id = $1`,
    [run],
  );
  await client.query(
    `INSERT INTO area_versions(area_id, version, geom)
     SELECT area_id, 2, ST_Translate(geom, 0.1, 0) FROM area_versions WHERE id = $1`,
    [a.id],
  );
  await client.query(
    `INSERT INTO observation_versions(observation_id, version, source_id, ingestion_run_id,
      ingestion_page_id, record_locator, normalizer_version, geom, temporal_basis, temporal_precision, temporal_label)
     SELECT observation_id, 2, source_id, ingestion_run_id, ingestion_page_id, record_locator,
       '2', ST_Translate(geom, 0.1, 0), temporal_basis, temporal_precision, temporal_label
     FROM observation_versions WHERE id = $1`,
    [s.version],
  );
  const { rows } = await client.query(
    `SELECT r.area_version_id, f.observation_version_id, f.intersection_area_m2,
       v.version AS observation_revision, a.version AS area_revision, p.payload_hash,
       v.period_start, v.period_end, r.status
     FROM validation_runs r JOIN area_versions a ON a.id = r.area_version_id
     JOIN validation_findings f ON f.validation_run_id = r.id
     JOIN observation_versions v ON v.id = f.observation_version_id
     JOIN ingestion_pages p ON p.id = v.ingestion_page_id WHERE r.id = $1`,
    [run],
  );
  expect(rows[0]).toEqual({
    area_version_id: a.id,
    observation_version_id: s.version,
    intersection_area_m2: 10,
    observation_revision: 1,
    area_revision: 1,
    payload_hash: createHash('sha256').update(s.source).digest('hex'),
    period_start: null,
    period_end: null,
    status: 'INCONCLUSIVE',
  });
  await rejected(
    'UPDATE area_versions SET geom = ST_Translate(geom, 1, 0) WHERE id = $1',
    [a.id],
  );
  await rejected('DELETE FROM observation_versions WHERE id = $1', [s.version]);
  await rejected(
    'UPDATE validation_findings SET intersection_area_m2 = 20 WHERE validation_run_id = $1',
    [run],
  );
  await rejected('UPDATE validation_runs SET status = $2 WHERE id = $1', [
    run,
    'PASS',
  ]);
  await rejected('DELETE FROM ingestion_pages WHERE id = $1', [s.page]);
});

it('namespaces external IDs by source and record namespace without sharing JADE identity', async () => {
  const first = await source();
  const second = await source();
  expect(first.observation).not.toBe(second.observation);
  await rejected(
    `INSERT INTO source_records(source_id, external_id) VALUES ($1, 'same-external-id')`,
    [first.source],
    '23505',
  );
  await client.query(
    `INSERT INTO source_records(source_id, record_namespace, external_id) VALUES ($1, 'another-layer', 'same-external-id')`,
    [first.source],
  );
  const a = await area();
  const b = await area();
  await client.query(
    `INSERT INTO area_external_references(area_id, namespace, external_id) VALUES ($1, 'caller-a', 'farm-1'), ($2, 'caller-b', 'farm-1')`,
    [a.area_id, b.area_id],
  );
  await rejected(
    `INSERT INTO area_external_references(area_id, namespace, external_id) VALUES ($1, 'caller-a', 'farm-1')`,
    [b.area_id],
    '23505',
  );
});

it('rejects an observation revision whose page belongs to a different provider', async () => {
  const first = await source();
  const second = await source();
  await rejected(
    `INSERT INTO observation_versions(observation_id, version, source_id, ingestion_run_id,
      ingestion_page_id, record_locator, normalizer_version, geom, temporal_basis, temporal_precision)
     VALUES ($1, 2, $2, $3, $4, '/features/0', '1', ST_GeomFromText($5, 4326), 'unknown', 'unknown')`,
    [first.observation, first.source, second.ingestion, second.page, polygon],
    '23503',
  );
  await rejected(
    'INSERT INTO environmental_observations(source_record_id, source_id) VALUES ($1, $2)',
    ['-1', first.source],
    '23503',
  );
});

it('requires findings to use exactly the evidence collection attached to the validation', async () => {
  const first = await source();
  const second = await source();
  const run = await validation((await area()).id);
  await rejected(
    insertFinding,
    [run, first.version, first.ingestion, 10, 1],
    '23503',
  );
  await attach(run, first.ingestion);
  await attach(run, second.ingestion);
  await rejected(
    insertFinding,
    [run, first.version, second.ingestion, 10, 1],
    '23503',
  );
  await client.query(insertFinding, [
    run,
    first.version,
    first.ingestion,
    10,
    1,
  ]);
});

it.each([
  ['self-intersection', 'POLYGON((0 0,1 1,1 0,0 1,0 0))'],
  ['empty polygon', 'POLYGON EMPTY'],
  ['point', 'POINT(0 0)'],
  ['out-of-range longitude', 'POLYGON((181 0,182 0,182 1,181 1,181 0))'],
])(
  'rejects %s as an area without repairing its geometry',
  async (_name, wkt) => {
    const a = await area();
    await rejected(
      'INSERT INTO area_versions(area_id, version, geom) VALUES ($1, 2, ST_GeomFromText($2, 4326))',
      [a.area_id, wkt],
    );
  },
);

it('does not silently accept another SRID or a third coordinate dimension', async () => {
  const a = await area();
  await rejected(
    'INSERT INTO area_versions(area_id, version, geom) VALUES ($1, 2, ST_GeomFromText($2, 4674))',
    [a.area_id, polygon],
    '22023',
  );
  await rejected(
    'INSERT INTO area_versions(area_id, version, geom) VALUES ($1, 2, ST_Force3D(ST_GeomFromText($2, 4326)))',
    [a.area_id, polygon],
    '22023',
  );
});

it.each([
  ['observation', 'day', '2024-01-01', null],
  ['occurrence', 'interval', '2024-02-01', '2024-01-01'],
  ['occurrence', 'day', '2024-01-01', '2024-01-02'],
  ['unknown', 'year', '2024-01-01', '2024-12-31'],
  ['observation', 'unknown', '2024-01-01', '2024-01-01'],
  ['observation', 'day', 'infinity', 'infinity'],
  ['prodes-year', 'year', null, null],
])(
  'rejects ambiguous or provider-specific temporal fields: %s / %s / %s / %s',
  async (basis, precision, start, end) => {
    const s = await source();
    await rejected(
      `INSERT INTO observation_versions(observation_id, version, source_id, ingestion_run_id,
      ingestion_page_id, record_locator, normalizer_version, geom, temporal_basis, temporal_precision, period_start, period_end)
     SELECT observation_id, 2, source_id, ingestion_run_id, ingestion_page_id, record_locator,
       '2', geom, $2, $3, $4::date, $5::date FROM observation_versions WHERE id = $1`,
      [s.version, basis, precision, start, end],
    );
  },
);

it('retains evidence of an invalid source geometry and records an issue instead of a zero measurement', async () => {
  const s = await source();
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO observation_versions(observation_id, version, source_id, ingestion_run_id,
      ingestion_page_id, record_locator, normalizer_version, geometry_issue, temporal_basis, temporal_precision)
     SELECT observation_id, 2, source_id, ingestion_run_id, ingestion_page_id, record_locator,
       '2', 'Self-intersection', 'unknown', 'unknown' FROM observation_versions WHERE id = $1 RETURNING id`,
    [s.version],
  );
  const run = await validation((await area()).id);
  await attach(run, s.ingestion);
  await rejected(insertFinding, [run, rows[0]!.id, s.ingestion, 0, 0]);
  await client.query(
    `INSERT INTO validation_findings(validation_run_id, observation_version_id, ingestion_run_id,
      analysis_status, issue_code, issue_message)
     VALUES ($1, $2, $3, 'invalid_geometry', 'INVALID_EVENT_GEOMETRY', 'Self-intersection')`,
    [run, rows[0]!.id, s.ingestion],
  );
  const result = await client.query(
    'SELECT intersection_area_m2 FROM validation_findings WHERE validation_run_id = $1',
    [run],
  );
  expect(result.rows[0].intersection_area_m2).toBeNull();
});

it('seals the collection when first used so later pages cannot change its evidence set', async () => {
  const s = await source();
  const run = await validation((await area()).id);
  await attach(run, s.ingestion);
  await rejected(
    `INSERT INTO ingestion_pages(ingestion_run_id, source_id, page_number, payload_hash,
      request_uri, request_method, retrieved_at, returned_records)
     SELECT ingestion_run_id, source_id, 2, payload_hash, request_uri, request_method, now(), 0
     FROM ingestion_pages WHERE id = $1`,
    [s.page],
  );
  await rejected('UPDATE ingestion_runs SET sealed_at = NULL WHERE id = $1', [
    s.ingestion,
  ]);
  await rejected(
    'UPDATE ingestion_runs SET returned_records = 2 WHERE id = $1',
    [s.ingestion],
  );
  // A later validation can reuse precisely the same archived collection.
  await attach(await validation((await area()).id), s.ingestion);
});

it('requires evidence even for an empty successful collection, while retaining a failed collection without pages', async () => {
  const s = await source();
  const run = await validation((await area()).id);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO ingestion_runs(source_id, adapter_name, adapter_version, request_context,
      status, matched_records, returned_records, started_at, finished_at)
     VALUES ($1, 'fixture', '1', '{}', 'complete', 0, 0, now(), now()) RETURNING id`,
    [s.source],
  );
  await rejected(
    `INSERT INTO validation_run_sources(validation_run_id, ingestion_run_id, coverage_status, coverage_reason)
     VALUES ($1, $2, 'unknown', 'Missing page receipts')`,
    [run, rows[0]!.id],
  );
  const failed = await client.query<{ id: string }>(
    `INSERT INTO ingestion_runs(source_id, adapter_name, adapter_version, request_context,
      status, returned_records, failure_reason, started_at, finished_at)
     VALUES ($1, 'fixture', '1', '{}', 'failed', 0, 'Timeout before any response', now(), now()) RETURNING id`,
    [s.source],
  );
  await attach(run, failed.rows[0]!.id);
});

it.each([
  [null, null],
  [-1, 10],
  [10, 101],
  ['NaN', 10],
  ['Infinity', 10],
  [10, 'NaN'],
  [0, 10],
  [10, 0],
])(
  'rejects missing, non-finite or inconsistent measurements: %s m2 / %s percent',
  async (areaM2, percentage) => {
    const s = await source();
    const run = await validation((await area()).id);
    await attach(run, s.ingestion);
    await rejected(insertFinding, [
      run,
      s.version,
      s.ingestion,
      areaM2,
      percentage,
    ]);
  },
);

it('separates run lifecycle from decisions and prevents evidence from being attached after finalization', async () => {
  const a = await area();
  const s = await source();
  const run = await validation(a.id);
  await rejected('UPDATE validation_runs SET cutoff_date = $2 WHERE id = $1', [
    run,
    '2025-01-01',
  ]);
  await rejected(`UPDATE validation_runs SET status = 'PASS' WHERE id = $1`, [
    run,
  ]);
  await rejected(
    `UPDATE validation_runs SET execution_status = 'completed', finished_at = now() WHERE id = $1`,
    [run],
  );
  await client.query(
    `UPDATE validation_runs SET execution_status = 'running' WHERE id = $1`,
    [run],
  );
  await rejected(
    `UPDATE validation_runs SET execution_status = 'queued' WHERE id = $1`,
    [run],
  );
  await attach(run, s.ingestion);
  await client.query(
    `UPDATE validation_runs SET execution_status = 'failed', status = 'ERROR', finished_at = now() WHERE id = $1`,
    [run],
  );
  await rejected(insertFinding, [run, s.version, s.ingestion, 0, 0]);
  await rejected(
    `INSERT INTO validation_run_sources(validation_run_id, ingestion_run_id, coverage_status, coverage_reason)
     VALUES ($1, $2, 'unknown', 'Late attachment')`,
    [run, s.ingestion],
  );
  await rejected('DELETE FROM validation_runs WHERE id = $1', [run]);
});
