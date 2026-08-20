import { describe, expect, it } from 'vitest';
import { computeStatistics, type Sample } from './statistics.ts';

const ok = (ms: number): Sample => ({ reachable: true, latencyMs: ms, error: null });
const failed = (): Sample => ({ reachable: false, latencyMs: null, error: 'timeout' });

describe('computeStatistics', () =>
{
  it('handles an empty sample set', () =>
  {
    const stats = computeStatistics([]);
    expect(stats.sent).toBe(0);
    expect(stats.averageMs).toBeNull();
    expect(stats.quality).toBe('unusable');
  });

  it('marks a target unreachable when every attempt fails', () =>
  {
    const stats = computeStatistics([failed(), failed(), failed()]);
    expect(stats.lossPercent).toBe(100);
    expect(stats.quality).toBe('unusable');
  });

  it('computes min, max, average and median', () =>
  {
    const stats = computeStatistics([ok(10), ok(30), ok(20)]);
    expect(stats.minimumMs).toBe(10);
    expect(stats.maximumMs).toBe(30);
    expect(stats.averageMs).toBe(20);
    expect(stats.medianMs).toBe(20);
  });

  it('averages the middle pair for an even sample count', () =>
  {
    expect(computeStatistics([ok(10), ok(20), ok(30), ok(40)]).medianMs).toBe(25);
  });

  it('measures loss against the total number of attempts', () =>
  {
    const stats = computeStatistics([ok(10), failed(), ok(20), failed()]);
    expect(stats.lossPercent).toBe(50);
    expect(stats.averageMs).toBe(15);
  });

  it('does not drag the average down with failed attempts', () =>
  {
    const stats = computeStatistics([ok(100), failed(), ok(100)]);
    expect(stats.averageMs).toBe(100);
  });

  it('derives jitter from consecutive samples', () =>
  {
    expect(computeStatistics([ok(10), ok(20), ok(15)]).jitterMs).toBe(7.5);
  });

  it('reports zero jitter for a flat line', () =>
  {
    expect(computeStatistics([ok(25), ok(25), ok(25)]).jitterMs).toBe(0);
  });

  it('ranks loss above low latency', () =>
  {
    const stats = computeStatistics([ok(10), failed(), ok(10), failed(), ok(10), failed()]);
    expect(stats.quality).toBe('poor');
  });

  it('treats instability as its own signal', () =>
  {
    const stats = computeStatistics([ok(10), ok(300), ok(10), ok(300)]);
    expect(stats.quality).toBe('poor');
  });
});