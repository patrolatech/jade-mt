import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { log } from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';

const [api = 'http://127.0.0.1:3000', web = 'http://127.0.0.1:5173'] =
  process.argv.slice(2);
const health = await globalThis.fetch(`${api}/health`);
assert.equal(health.status, 200);
assert.equal((await health.json()).status, 'ok');
log('GET /health: 200');

const valid = await globalThis.fetch(`${api}/validations`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: await readFile(
    new URL('../docs/examples/validation-input.json', import.meta.url),
    'utf8',
  ),
});
assert.equal(valid.status, 501);
assert.equal((await valid.json()).code, 'RESEARCH_NOT_IMPLEMENTED');
log('POST /validations synthetic request: 501 RESEARCH_NOT_IMPLEMENTED');

const invalid = await globalThis.fetch(`${api}/validations`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});
assert.equal(invalid.status, 400);
log('POST /validations invalid request: 400');

const page = await globalThis.fetch(web);
assert.equal(page.status, 200);
assert.match(await page.text(), /<title>JADE-MT<\/title>/);
const main = await globalThis.fetch(`${web}/src/main.tsx`);
assert.equal(main.status, 200);
const code = await main.text();
assert.match(code, /Environmental Validation Research Prototype/);
assert.match(code, /packages\/schemas\/dist\/index.js/);
log(
  'Vite index and transformed React entry: 200, shared schema import resolved',
);
