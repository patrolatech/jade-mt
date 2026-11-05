import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { PhaseMetrics } from './research-metrics.js';

const execFile = promisify(execFileCallback);

export async function gitMetadata(root: string) {
  try {
    const { stdout: commit } = await execFile('git', ['rev-parse', 'HEAD'], {
      cwd: root,
    });
    const { stdout: status } = await execFile(
      'git',
      ['status', '--porcelain'],
      {
        cwd: root,
      },
    );
    return { commit: commit.trim(), checkoutDirty: status.trim().length > 0 };
  } catch {
    return { commit: null, checkoutDirty: null };
  }
}

export async function runtimeVersions(pool: {
  query(text: string): Promise<{ rows: Record<string, string>[] }>;
}) {
  const { rows } = await pool.query(
    'SELECT version() AS postgresql, postgis_full_version() AS postgis',
  );
  return {
    node: process.version,
    postgresql: rows[0]?.postgresql ?? null,
    postgis: rows[0]?.postgis ?? null,
  };
}

export interface RunMetadata {
  mode: 'live' | 'replay';
  executedAt: string;
  git: { commit: string | null; checkoutDirty: boolean | null };
  processingVersion: string;
  runtimeVersions: {
    node: string;
    postgresql: string | null;
    postgis: string | null;
  } | null;
  runtimeVersionsError?: string;
  adapterVersions?: {
    dataset: string;
    adapter: { name: string; version: string } | null;
  }[];
  input?: { file: string };
  /** Capture directory name (basename only — never an author-local path). */
  capture?: string;
}

/**
 * Assembles the run record. Deliberately takes no database URL: connection
 * strings (passwords in userinfo or query parameters) must never reach files
 * that travel with a capture package. Runtime versions are read through the
 * pool's server-side `version()`/`postgis_full_version()` instead.
 */
export async function buildRunMetadata(options: {
  mode: 'live' | 'replay';
  root: string;
  processingVersion: string;
  pool: {
    query(text: string): Promise<{ rows: Record<string, string>[] }>;
  };
  adapterVersions?: RunMetadata['adapterVersions'];
  input?: { file: string };
  capture?: string;
}): Promise<RunMetadata> {
  let versions: RunMetadata['runtimeVersions'] = null;
  let runtimeVersionsError: string | undefined;
  try {
    versions = await runtimeVersions(options.pool);
  } catch (cause) {
    runtimeVersionsError =
      cause instanceof Error ? cause.message : String(cause);
  }
  return {
    mode: options.mode,
    executedAt: new Date().toISOString(),
    git: await gitMetadata(options.root),
    processingVersion: options.processingVersion,
    runtimeVersions: versions,
    ...(runtimeVersionsError ? { runtimeVersionsError } : {}),
    ...(options.adapterVersions
      ? { adapterVersions: options.adapterVersions }
      : {}),
    ...(options.input ? { input: options.input } : {}),
    ...(options.capture ? { capture: options.capture } : {}),
  };
}

export interface RunFailure {
  message: string;
  httpStatus: number | null;
  validationId: string | null;
}

/**
 * Writes the artifacts of one research run. Metrics and metadata are always
 * recorded — including on the failure path — so an unavailable upstream leaves
 * behind timings, versions and the error/validationId needed to document it.
 */
export async function saveRunArtifacts(
  directory: string,
  artifacts: {
    metrics: PhaseMetrics;
    metadata: RunMetadata;
    request?: unknown;
    result?: unknown;
    failure?: RunFailure;
    /** Defaults to `metrics.json`; replay uses `metrics.replay-<ts>.json`. */
    metricsFileName?: string;
  },
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const writeJson = async (name: string, data: unknown) => {
    await writeFile(
      join(directory, name),
      JSON.stringify(data, null, 2) + '\n',
    );
  };
  await writeJson(
    artifacts.metricsFileName ?? 'metrics.json',
    artifacts.metrics,
  );
  await writeJson('metadata.json', artifacts.metadata);
  if (artifacts.request !== undefined)
    await writeJson('request.json', artifacts.request);
  if (artifacts.result !== undefined)
    await writeJson('result.json', artifacts.result);
  if (artifacts.failure !== undefined)
    await writeJson('failure.json', artifacts.failure);
}
