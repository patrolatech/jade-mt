import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { log } from 'node:console';
import process from 'node:process';
import assert from 'node:assert/strict';
import { createDatabasePool } from '../packages/database/dist/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(
  process.argv[2] ??
    `${root}/.data/research/geometry-${new Date().toISOString().replaceAll(':', '-')}.json`,
);
const pool = createDatabasePool(
  process.env.DATABASE_URL ?? 'postgresql://jade:jade_dev@127.0.0.1:5432/jade',
);
try {
  const { rows } = await pool.query<{ version: string }>(
    'SELECT postgis_full_version() AS version',
  );
  const results = await pool.query(
    await readFile(
      `${root}/packages/database/sql/intersection-research.sql`,
      'utf8',
    ),
  );
  assert.ok(rows[0]);
  const data = {
    retrievedAt: new Date().toISOString(),
    version: rows[0].version,
    experiments: (Array.isArray(results) ? results : [results]).map(
      (result) => result.rows,
    ),
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(data, null, 2) + '\n');
  log(JSON.stringify(data, null, 2));
} finally {
  await pool.end();
}
