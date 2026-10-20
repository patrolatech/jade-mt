import { execFile as execFileCallback } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export interface PhaseMetrics {
  /** Wall time of HTTP requests (headers + body consumption). Concurrent pages sum up. */
  networkMs: number;
  /** Wall time of the whole source phase (fetch + parse + mapping + archive). */
  sourcePhaseMs: number;
  /** Wall time of PostGIS validateProperty + analyzeIntersection. */
  geometryMs: number;
  persistenceStartMs: number;
  persistenceCompleteMs: number;
  persistenceFailMs: number;
  /** Wall time of the full request handling. */
  totalMs: number;
  pagesFetched: number;
  bytesReceived: number;
}

export function createMetrics(): PhaseMetrics {
  return {
    networkMs: 0,
    sourcePhaseMs: 0,
    geometryMs: 0,
    persistenceStartMs: 0,
    persistenceCompleteMs: 0,
    persistenceFailMs: 0,
    totalMs: 0,
    pagesFetched: 0,
    bytesReceived: 0,
  };
}

export async function timed<T>(
  metrics: PhaseMetrics,
  key:
    | 'sourcePhaseMs'
    | 'geometryMs'
    | 'persistenceStartMs'
    | 'persistenceCompleteMs'
    | 'persistenceFailMs'
    | 'totalMs',
  operation: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await operation();
  } finally {
    metrics[key] += performance.now() - started;
  }
}

/**
 * Wraps fetch to count pages, total HTTP time and response bytes. The body is
 * counted when the consumer reads arrayBuffer(), matching how the WFS adapter
 * hashes the exact bytes it receives.
 */
export function instrumentedFetch(
  metrics: PhaseMetrics,
  inner: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    metrics.pagesFetched += 1;
    const started = performance.now();
    const response = await inner(input, init);
    metrics.networkMs += performance.now() - started;
    if (!response || typeof response.arrayBuffer !== 'function')
      return response;
    return new Proxy(response, {
      get(target, property) {
        if (property === 'arrayBuffer') {
          return async () => {
            const bodyStarted = performance.now();
            const buffer = await target.arrayBuffer();
            metrics.networkMs += performance.now() - bodyStarted;
            metrics.bytesReceived += buffer.byteLength;
            return buffer;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as Response;
  };
}

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

export function maskDatabaseUrl(url: string): string {
  return url.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:***@');
}
