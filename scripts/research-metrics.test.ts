import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMetrics, instrumentedFetch, timed } from './research-metrics.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('instrumentedFetch', () => {
  it('counts the elapsed time of rejected requests', async () => {
    const metrics = createMetrics();
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(0).mockReturnValueOnce(76);
    const failing = vi
      .fn()
      .mockRejectedValue(new Error('synthetic WFS outage'));
    await expect(
      instrumentedFetch(
        metrics,
        failing as typeof globalThis.fetch,
      )('https://example.test/wfs'),
    ).rejects.toThrow('synthetic WFS outage');
    expect(metrics.networkMs).toBe(76);
    expect(metrics.pagesFetched).toBe(1);
    expect(metrics.bytesReceived).toBe(0);
  });

  it('counts header, body and rejected body-read time', async () => {
    const metrics = createMetrics();
    const now = vi.spyOn(performance, 'now');
    now
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(30)
      .mockReturnValueOnce(45);
    const inner = vi.fn().mockResolvedValue(new Response('{"features":[]}'));
    const response = await instrumentedFetch(
      metrics,
      inner as typeof globalThis.fetch,
    )('https://example.test/wfs');
    const buffer = await response.arrayBuffer();
    expect(metrics.pagesFetched).toBe(1);
    expect(metrics.networkMs).toBe(10 + 15);
    expect(metrics.bytesReceived).toBe(buffer.byteLength);

    now
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(110)
      .mockReturnValueOnce(120)
      .mockReturnValueOnce(150);
    const brokenBody = {
      arrayBuffer: () => Promise.reject(new Error('body reset')),
    } as unknown as Response;
    const innerBroken = vi.fn().mockResolvedValue(brokenBody);
    await expect(
      instrumentedFetch(
        metrics,
        innerBroken as typeof globalThis.fetch,
      )('https://example.test/wfs').then((res) => res.arrayBuffer()),
    ).rejects.toThrow('body reset');
    // 10ms headers + 30ms body attempt + 10ms headers + 30ms rejected body.
    expect(metrics.networkMs).toBe(10 + 15 + 10 + 30);
    expect(metrics.pagesFetched).toBe(2);
  });
});

describe('timed', () => {
  it('accumulates time when the operation rejects', async () => {
    const metrics = createMetrics();
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(0).mockReturnValueOnce(55);
    await expect(
      timed(metrics, 'totalMs', () => Promise.reject(new Error('run failed'))),
    ).rejects.toThrow('run failed');
    expect(metrics.totalMs).toBe(55);
  });
});
