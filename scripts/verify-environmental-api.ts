import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { error, log } from 'node:console';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { buildApp } from '../apps/api/src/app.js';
import {
  archiveSourcePage,
  describeSourcePage,
} from '../apps/api/src/plugins/source-evidence.js';
import { processingVersion } from '../apps/api/src/plugins/processing-version.js';
import {
  createDatabasePool,
  PostgisGeometryRepository,
  PostgisValidationRepository,
  verifyDatabase,
} from '../packages/database/dist/index.js';
import { TerraBrasilisSource } from '../packages/environmental-oracle/dist/index.js';
import type {
  ValidationInput,
  ValidationResult,
} from '../packages/schemas/src/index.js';
import { createMetrics, instrumentedFetch, timed } from './research-metrics.js';
import {
  buildRunMetadata,
  saveRunArtifacts,
  type RunFailure,
} from './research-metadata.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(
  process.argv[2] ??
    join(
      root,
      '.data/research',
      `api-sinop-${new Date().toISOString().replaceAll(':', '-')}`,
    ),
);
const payload: ValidationInput = await readFile(
  join(root, 'docs/examples/validation-input-sinop.json'),
  'utf8',
).then((text) => JSON.parse(text) as ValidationInput);
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://jade:jade_dev@127.0.0.1:5432/jade';
const metrics = createMetrics();
const pool = createDatabasePool(databaseUrl);
await verifyDatabase(pool);
const fingerprint = await processingVersion();
const geometryRepository = new PostgisGeometryRepository(pool);
const validationRepository = new PostgisValidationRepository(pool, fingerprint);
const innerSource = new TerraBrasilisSource({
  datasets: ['PRODES', 'DETER'],
  onPage: archiveSourcePage(output),
  fetch: instrumentedFetch(metrics),
});
const app = await buildApp({
  config: {
    databaseUrl,
    host: '127.0.0.1',
    port: 3000,
    logLevel: 'silent',
  },
  validationDependencies: {
    source: {
      fetchEvents: (input) =>
        timed(metrics, 'sourcePhaseMs', () => innerSource.fetchEvents(input)),
    },
    geometryRepository: {
      validateProperty: (geometry) =>
        timed(metrics, 'geometryMs', () =>
          geometryRepository.validateProperty(geometry),
        ),
      analyzeIntersection: (query) =>
        timed(metrics, 'geometryMs', () =>
          geometryRepository.analyzeIntersection(query),
        ),
    },
  },
  validationPersistence: {
    repository: {
      start: (validationId, input) =>
        timed(metrics, 'persistenceStartMs', () =>
          validationRepository.start(validationId, input),
        ),
      complete: (result, events, evidence) =>
        timed(metrics, 'persistenceCompleteMs', () =>
          validationRepository.complete(result, events, evidence),
        ),
      fail: (error, evidence) =>
        timed(metrics, 'persistenceFailMs', () =>
          validationRepository.fail(error, evidence),
        ),
      find: (validationId) => validationRepository.find(validationId),
    },
    describePage: describeSourcePage(output),
  },
});
let result: ValidationResult | undefined;
let failure: RunFailure | undefined;
let caught: unknown;
let httpStatus: number | null = null;
let validationId: string | null = null;
try {
  const response = await timed(metrics, 'totalMs', () =>
    app.inject({
      method: 'POST',
      url: '/validations',
      payload,
    }),
  );
  httpStatus = response.statusCode;
  try {
    const body = JSON.parse(response.body) as { validationId?: unknown };
    if (typeof body.validationId === 'string') validationId = body.validationId;
  } catch {
    // Non-JSON body (e.g. proxy error pages) — keep validationId null.
  }
  assert.equal(httpStatus, 200, response.body);
  result = response.json<ValidationResult>();
  validationId = result.validationId;
  assert.equal(result.status, 'INCONCLUSIVE');
  assert.equal(result.methodologyStatus, 'draft');
  assert.deepEqual(
    result.sources.map((source) => source.dataset),
    ['PRODES', 'DETER'],
  );
  assert.equal(
    result.sources.reduce((sum, source) => sum + source.matchedEvents, 0),
    result.eventsFound,
  );
  for (const source of result.sources) {
    for (const page of source.pages) {
      const bytes = await readFile(join(output, `${page.payloadHash}.json`));
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        page.payloadHash,
      );
    }
  }
  for (const { analysis } of result.eventAnalyses) {
    assert.ok(Number.isFinite(analysis.intersectionAreaM2));
    assert.equal(analysis.intersectionExists, analysis.intersectionAreaM2 > 0);
    assert.ok(
      analysis.intersectionPercentage >= 0 &&
        analysis.intersectionPercentage <= 100,
    );
  }
} catch (cause) {
  caught = cause;
  failure = {
    message: cause instanceof Error ? cause.message : String(cause),
    httpStatus,
    validationId,
  };
}
try {
  const metadata = await buildRunMetadata({
    mode: 'live',
    root,
    processingVersion: fingerprint,
    pool,
    ...(result
      ? {
          adapterVersions: result.sources.map((source) => ({
            dataset: source.dataset,
            adapter: source.adapter ?? null,
          })),
        }
      : {}),
    input: { file: 'docs/examples/validation-input-sinop.json' },
  });
  await saveRunArtifacts(output, {
    metrics,
    metadata,
    request: payload,
    ...(result ? { result } : {}),
    ...(failure ? { failure } : {}),
  });
  log(
    JSON.stringify(
      {
        outcome: failure ? 'failed' : 'ok',
        httpStatus,
        validationId,
        status: result?.status,
        eventsFound: result?.eventsFound,
        measured: result?.eventAnalyses.length,
        issueCodes: [
          ...new Set(result?.issues?.map((issue) => issue.code) ?? []),
        ],
        metrics,
        output,
      },
      null,
      2,
    ),
  );
  if (caught) {
    error(JSON.stringify({ outcome: 'failed', ...failure, output }, null, 2));
    throw caught;
  }
} finally {
  await app.close();
  await pool.end();
}
