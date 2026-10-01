import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { TerraBrasilisSource } from '@jade/environmental-oracle';
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

it('archives and replays ordered page bytes including a BOM without upstream access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jade-page-replay-'));
  try {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    const bodies = [1, 2].map((id) =>
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(
          JSON.stringify({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: 'EPSG:4326' } },
            features: [
              {
                type: 'Feature',
                id: `event.${id}`,
                geometry,
                properties: { view_date: '2021-01-02', label: 'ação' },
              },
            ],
            numberMatched: 2,
            numberReturned: 1,
          }),
        ),
      ]),
    );
    let index = 0;
    const input = { geometry, cutoffDate: new Date('2020-12-31') };
    const captured = await new TerraBrasilisSource({
      datasets: ['DETER'],
      fetch: async () => new Response(bodies[index++]!),
      onPage: archiveSourcePage(directory),
    }).fetchEvents(input);
    const receipts = captured.sources[0]!.pages;
    expect(
      receipts.map((receipt) =>
        new URL(receipt.requestUrl).searchParams.get('startIndex'),
      ),
    ).toEqual(['0', '1']);
    for (const [i, receipt] of receipts.entries()) {
      const bytes = await readFile(
        join(directory, `${receipt.payloadHash}.json`),
      );
      expect(bytes).toEqual(bodies[i]);
      expect(receipt.payloadHash).toBe(
        createHash('sha256').update(bytes).digest('hex'),
      );
      expect(receipt.payloadHash).not.toBe(
        createHash('sha256')
          .update(new TextDecoder().decode(bytes))
          .digest('hex'),
      );
      expect(captured.events[i]!.provenance).toMatchObject({
        payloadHash: receipt.payloadHash,
        recordLocator: '/features/0',
        normalizerVersion: 'terrabrasilis-wfs/0.3',
      });
    }
    const replayed = await new TerraBrasilisSource({
      datasets: ['DETER'],
      fetch: async (url) => {
        const receipt = receipts.find(
          (page) => page.requestUrl === String(url),
        );
        if (!receipt) throw new Error('Unexpected replay request');
        const bytes = await readFile(
          join(directory, `${receipt.payloadHash}.json`),
        );
        return new Response(bytes);
      },
      onPage: archiveSourcePage(directory),
    }).fetchEvents(input);
    expect(replayed.events).toEqual(captured.events);
    expect(replayed.sources[0]!.pages.map((page) => page.payloadHash)).toEqual(
      receipts.map((page) => page.payloadHash),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
