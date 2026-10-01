import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { archiveSourcePage, describeSourcePage } from './source-evidence.js';
import { readConfig } from './config.js';

it('archives exact bytes and receipts without overwriting an earlier capture', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jade-evidence-test-'));
  try {
    const body = '{ "type": "FeatureCollection", "features": [] }\n';
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const page = {
      body,
      payloadHash,
      method: 'GET' as const,
      requestUrl: 'https://example.invalid/wfs?count=1',
      retrievedAt: '2026-09-18T00:00:00.000Z',
    };
    const archive = archiveSourcePage(directory);
    await archive(page);
    await archive(page);
    expect(await readFile(join(directory, `${payloadHash}.json`), 'utf8')).toBe(
      body,
    );
    const files = await readdir(directory);
    expect(files).toHaveLength(2);
    const receipt = JSON.parse(
      await readFile(
        join(
          directory,
          files.find((file) => file.endsWith('.receipt.json'))!,
        ),
        'utf8',
      ),
    );
    expect(receipt).toMatchObject({
      payloadHash,
      requestUrl: page.requestUrl,
      retrievedAt: page.retrievedAt,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('publishes concurrent copies atomically and refuses corrupted archives or false hashes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jade-evidence-test-'));
  try {
    const body = JSON.stringify({ padding: 'x'.repeat(300_000) });
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const page = {
      body,
      payloadHash,
      method: 'GET' as const,
      requestUrl: 'https://example.invalid/wfs',
      retrievedAt: '2026-09-19T00:00:00.000Z',
    };
    const archive = archiveSourcePage(directory);
    await Promise.all(Array.from({ length: 5 }, () => archive(page)));
    expect(await describeSourcePage(directory)(page)).toMatchObject({
      payloadHash,
      storageKey: `${payloadHash}.json`,
      byteLength: Buffer.byteLength(body),
    });
    expect(await readdir(directory)).toHaveLength(2);
    await expect(archive({ ...page, body: 'changed' })).rejects.toThrow(
      'hash mismatch',
    );
    await writeFile(join(directory, `${payloadHash}.json`), 'corrupt');
    await expect(archive(page)).rejects.toThrow('content hash');
    await expect(describeSourcePage(directory)(page)).rejects.toThrow(
      'hash mismatch',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('selects real sources through configuration and rejects empty/duplicate selections', () => {
  expect(readConfig({}).datasets).toEqual(['PRODES', 'DETER']);
  expect(readConfig({ ENVIRONMENTAL_DATASETS: 'PRODES' }).datasets).toEqual([
    'PRODES',
  ]);
  for (const value of ['', 'PRODES,PRODES', 'made-up']) {
    expect(() => readConfig({ ENVIRONMENTAL_DATASETS: value })).toThrow(
      'ENVIRONMENTAL_DATASETS',
    );
  }
});
