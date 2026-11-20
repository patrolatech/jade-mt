import { performance } from 'node:perf_hooks';

export interface PhaseMetrics {
  /** HTTP time (headers + body consumption), including rejected requests. Concurrent pages sum up. */
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
  /** Fetch attempts, including ones rejected by the upstream. */
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
 * Wraps fetch to count attempts, total HTTP time and response bytes. Elapsed
 * time is recorded in `finally`, so rejected requests (unavailable upstream,
 * body reset) still contribute to `networkMs`. The body is counted when the
 * consumer reads arrayBuffer(), matching how the WFS adapter hashes the exact
 * bytes it receives.
 */
export function instrumentedFetch(
  metrics: PhaseMetrics,
  inner: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    metrics.pagesFetched += 1;
    const started = performance.now();
    let response: Response;
    try {
      response = await inner(input, init);
    } finally {
      metrics.networkMs += performance.now() - started;
    }
    if (!response || typeof response.arrayBuffer !== 'function')
      return response;
    return new Proxy(response, {
      get(target, property) {
        if (property === 'arrayBuffer') {
          return async () => {
            const bodyStarted = performance.now();
            try {
              const buffer = await target.arrayBuffer();
              metrics.bytesReceived += buffer.byteLength;
              return buffer;
            } finally {
              metrics.networkMs += performance.now() - bodyStarted;
            }
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as Response;
  };
}
