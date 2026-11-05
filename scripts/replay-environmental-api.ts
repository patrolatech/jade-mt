import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve, join } from 'node:path';
import { error, log } from 'node:console';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { buildApp } from '../apps/api/src/app.js';
import { processingVersion } from '../apps/api/src/plugins/processing-version.js';
import {
  createDatabasePool,
  PostgisGeometryRepository,
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

const captureDirectory = process.argv[2];
if (!captureDirectory) {
  error(
    'Usage: pnpm test:replay <capture-directory>\nCreate a local capture with pnpm test:live first.',
  );
  process.exit(1);
}
const capture = resolve(captureDirectory);
const payload: ValidationInput = JSON.parse(
  await readFile(join(capture, 'request.json'), 'utf8'),
);
const expected: ValidationResult = JSON.parse(
  await readFile(join(capture, 'result.json'), 'utf8'),
);
const key = (url: string, method = 'GET', body = '') =>
  JSON.stringify([url, method, body]);
const pages = new Map(
  expected.sources.flatMap((source) =>
    source.pages.map((page) => [
      key(page.requestUrl, page.method, page.requestBody),
      page,
    ]),
  ),
);
const seen = new Set<string>();
const metrics = createMetrics();
const source = new TerraBrasilisSource({
  datasets: expected.sources.map(({ dataset }) => {
    assert.ok(dataset === 'PRODES' || dataset === 'DETER');
    return dataset;
  }),
  fetch: instrumentedFetch(metrics, async (url, options) => {
    assert.ok(options?.body == null || typeof options.body === 'string');
    const requestKey = key(String(url), options?.method, options?.body ?? '');
    const page = pages.get(requestKey);
    assert.ok(page, 'Replay requested a page not present in the capture');
    const body = await readFile(join(capture, `${page.payloadHash}.json`));
    assert.equal(
      createHash('sha256').update(body).digest('hex'),
      page.payloadHash,
    );
    seen.add(requestKey);
    return new globalThis.Response(body, {
      headers: { 'content-type': 'application/json' },
    });
  }),
});
const pool = createDatabasePool(
  process.env.DATABASE_URL ?? 'postgresql://jade:jade_dev@127.0.0.1:5432/jade',
);
const geometryRepository = new PostgisGeometryRepository(pool);
const fingerprint = await processingVersion();
const app = await buildApp({
  config: {
    databaseUrl: '',
    host: '127.0.0.1',
    port: 3000,
    logLevel: 'silent',
  },
  validationDependencies: {
    source: {
      fetchEvents: (input) =>
        timed(metrics, 'sourcePhaseMs', () => source.fetchEvents(input)),
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
    // Non-JSON body — keep validationId null.
  }
  assert.equal(httpStatus, 200, response.body);
  result = response.json<ValidationResult>();
  validationId = result.validationId;
  assert.equal(result.status, expected.status);
  assert.equal(result.eventsFound, expected.eventsFound);
  assert.deepEqual(result.eventAnalyses, expected.eventAnalyses);
  assert.deepEqual(result.issues, expected.issues);
  assert.equal(seen.size, pages.size);
} catch (cause) {
  caught = cause;
  failure = {
    message: cause instanceof Error ? cause.message : String(cause),
    httpStatus,
    validationId,
  };
}
const metricsFile = join(
  capture,
  `metrics.replay-${new Date().toISOString().replaceAll(':', '-')}.json`,
);
try {
  const metadata = await buildRunMetadata({
    mode: 'replay',
    root: fileURLToPath(new URL('../', import.meta.url)),
    processingVersion: fingerprint,
    pool,
    adapterVersions: expected.sources.map((source) => ({
      dataset: source.dataset,
      adapter: source.adapter ?? null,
    })),
    capture: basename(capture),
  });
  await saveRunArtifacts(capture, {
    metrics,
    metadata,
    metricsFileName: basename(metricsFile),
    ...(failure ? { failure } : {}),
  });
  await writeFile(
    join(capture, 'metrics.replay.json'),
    JSON.stringify(metrics, null, 2) + '\n',
  );
  log(
    JSON.stringify(
      {
        outcome: failure ? 'failed' : 'ok',
        result: failure
          ? null
          : `Replay passed without external network: ${result?.eventsFound} events, ${result?.eventAnalyses.length} measurements, ${seen.size} verified pages`,
        httpStatus,
        validationId,
        metrics,
        metricsFile,
      },
      null,
      2,
    ),
  );
  if (caught) {
    error(JSON.stringify({ outcome: 'failed', ...failure, capture }, null, 2));
    throw caught;
  }
} finally {
  await app.close();
  await pool.end();
}
