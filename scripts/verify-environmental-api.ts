import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { log } from 'node:console';
import process from 'node:process';
import { buildApp } from '../apps/api/src/app.js';
import type {
  ValidationInput,
  ValidationResult,
} from '../packages/schemas/src/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(
  process.argv[2] ??
    join(
      root,
      '.data/research',
      `api-sinop-${new Date().toISOString().replaceAll(':', '-')}`,
    ),
);
const payload: ValidationInput = JSON.parse(
  await readFile(
    join(root, 'docs/examples/validation-input-sinop.json'),
    'utf8',
  ),
);
const app = await buildApp({
  config: {
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgresql://jade:jade_dev@127.0.0.1:5432/jade',
    host: '127.0.0.1',
    port: 3000,
    logLevel: 'silent',
    datasets: ['PRODES', 'DETER'],
    sourceEvidenceDirectory: output,
  },
});
try {
  const response = await app.inject({
    method: 'POST',
    url: '/validations',
    payload,
  });
  assert.equal(response.statusCode, 200, response.body);
  const result = response.json<ValidationResult>();
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
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, 'request.json'),
    JSON.stringify(payload, null, 2) + '\n',
  );
  await writeFile(
    join(output, 'result.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  log(
    JSON.stringify(
      {
        httpStatus: response.statusCode,
        status: result.status,
        eventsFound: result.eventsFound,
        measured: result.eventAnalyses.length,
        issueCodes: [...new Set(result.issues?.map((issue) => issue.code))],
        output,
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
}
