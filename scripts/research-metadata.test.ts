import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildRunMetadata,
  gitMetadata,
  saveRunArtifacts,
  type RunFailure,
} from './research-metadata.js';
import { createMetrics } from './research-metrics.js';

const root = fileURLToPath(new URL('../', import.meta.url));

const healthyPool = {
  query: async () => ({
    rows: [
      {
        postgresql: 'PostgreSQL 17.5',
        postgis: 'POSTGIS="3.5.2 dea6d0a" [EXTENSION] PGSQL="170"',
      },
    ],
  }),
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'jade-research-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('buildRunMetadata', () => {
  it('never exposes database connection information', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      'postgresql://jade:supersecreta@127.0.0.1:5434/jade?password=querysecreta';
    try {
      const metadata = await buildRunMetadata({
        mode: 'live',
        root,
        processingVersion: 'sha256:test',
        pool: healthyPool,
        adapterVersions: [
          {
            dataset: 'PRODES',
            adapter: {
              name: 'TerraBrasilisSource',
              version: 'terrabrasilis-wfs/0.3',
            },
          },
        ],
        input: { file: 'docs/examples/validation-input-sinop.json' },
      });
      const serialized = JSON.stringify(metadata);
      expect(serialized).not.toContain('supersecreta');
      expect(serialized).not.toContain('querysecreta');
      expect(serialized).not.toContain('postgresql://');
      expect(serialized).not.toContain('127.0.0.1');
      expect(serialized).not.toContain('DATABASE_URL');
      expect(metadata.mode).toBe('live');
      expect(metadata.runtimeVersions?.node).toBe(process.version);
      expect(metadata.runtimeVersions?.postgresql).toContain('PostgreSQL');
      expect(metadata.git.commit).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it('records a runtime-versions failure without leaking the connection', async () => {
    const metadata = await buildRunMetadata({
      mode: 'replay',
      root,
      processingVersion: 'sha256:test',
      pool: {
        query: async () => {
          throw new Error('connection refused');
        },
      },
      capture: 'semana-05-09-out-sinop',
    });
    expect(metadata.runtimeVersions).toBeNull();
    expect(metadata.runtimeVersionsError).toContain('connection refused');
    expect(metadata.capture).toBe('semana-05-09-out-sinop');
    expect(JSON.stringify(metadata)).not.toContain('postgresql://');
  });
});

describe('saveRunArtifacts', () => {
  const failure: RunFailure = {
    message: 'Environmental source unavailable',
    httpStatus: 503,
    validationId: '34d94536-75fb-44a1-bbc8-c6a277aa56cf',
  };

  it('writes metrics, metadata, request and failure records on the error path', async () => {
    const directory = await temporaryDirectory();
    const metrics = createMetrics();
    metrics.networkMs = 76;
    const metadata = await buildRunMetadata({
      mode: 'live',
      root,
      processingVersion: 'sha256:test',
      pool: healthyPool,
    });
    await saveRunArtifacts(directory, {
      metrics,
      metadata,
      request: { cutoffDate: '2020-12-31' },
      failure,
    });
    const writtenMetrics = JSON.parse(
      await readFile(join(directory, 'metrics.json'), 'utf8'),
    );
    expect(writtenMetrics.networkMs).toBe(76);
    expect(writtenMetrics.pagesFetched).toBe(0);
    const writtenMetadata = JSON.parse(
      await readFile(join(directory, 'metadata.json'), 'utf8'),
    );
    expect(JSON.stringify(writtenMetadata)).not.toContain('postgresql://');
    expect(
      JSON.parse(await readFile(join(directory, 'failure.json'), 'utf8')),
    ).toEqual(failure);
    expect(
      JSON.parse(await readFile(join(directory, 'request.json'), 'utf8')),
    ).toEqual({ cutoffDate: '2020-12-31' });
    await expect(
      readFile(join(directory, 'result.json'), 'utf8'),
    ).rejects.toThrow();
  });

  it('writes the result on success with a custom metrics file name', async () => {
    const directory = await temporaryDirectory();
    const metadata = await buildRunMetadata({
      mode: 'replay',
      root,
      processingVersion: 'sha256:test',
      pool: healthyPool,
    });
    await saveRunArtifacts(directory, {
      metrics: createMetrics(),
      metadata,
      result: { status: 'INCONCLUSIVE', eventsFound: 0 },
      metricsFileName: 'metrics.replay.json',
    });
    expect(
      JSON.parse(
        await readFile(join(directory, 'metrics.replay.json'), 'utf8'),
      ),
    ).toHaveProperty('totalMs');
    expect(
      JSON.parse(await readFile(join(directory, 'result.json'), 'utf8')),
    ).toEqual({ status: 'INCONCLUSIVE', eventsFound: 0 });
    await expect(
      readFile(join(directory, 'failure.json'), 'utf8'),
    ).rejects.toThrow();
    await expect(
      readFile(join(directory, 'metrics.json'), 'utf8'),
    ).rejects.toThrow();
  });
});

describe('gitMetadata', () => {
  it('reports the current commit', async () => {
    const metadata = await gitMetadata(root);
    expect(metadata.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof metadata.checkoutDirty).toBe('boolean');
  });
});
