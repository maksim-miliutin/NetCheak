import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { measureTarget, probeOnce } from './probe';

let server: Server;
let openPort = 0;

beforeAll(async () =>
{
  server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  openPort = typeof address === 'object' && address !== null ? address.port : 0;
});

afterAll(async () =>
{
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('probeOnce', () =>
{
  it('reaches a listening port and measures the time', async () =>
  {
    const sample = await probeOnce('127.0.0.1', openPort, 2000);
    expect(sample.reachable).toBe(true);
    expect(sample.error).toBeNull();
    expect(typeof sample.latencyMs).toBe('number');
    expect(sample.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports a refused connection instead of throwing', async () =>
  {
    const sample = await probeOnce('127.0.0.1', 1, 2000);
    expect(sample.reachable).toBe(false);
    expect(sample.latencyMs).toBeNull();
    expect(sample.error).toBeTruthy();
  });

  it('gives up after the timeout on an unroutable address', async () =>
  {
    const started = Date.now();
    const sample = await probeOnce('192.0.2.1', 443, 300);
    const elapsed = Date.now() - started;

    expect(sample.reachable).toBe(false);
    expect(elapsed).toBeLessThan(2000);
  });

  it('rejects an unknown host name', async () =>
  {
    const sample = await probeOnce('no-such-host.invalid', 443, 2000);
    expect(sample.reachable).toBe(false);
    expect(sample.error).toBeTruthy();
  });
});

describe('measureTarget', () =>
{
  it('runs exactly the requested number of attempts', async () =>
  {
    const result = await measureTarget(
      { name: 'local', host: '127.0.0.1', port: openPort },
      { attempts: 3, timeoutMs: 1000, delayMs: 0 },
    );

    expect(result.samples).toHaveLength(3);
    expect(result.statistics.sent).toBe(3);
    expect(result.statistics.received).toBe(3);
    expect(result.statistics.quality).toBe('good');
  });

  it('carries the target through to the result', async () =>
  {
    const target = { name: 'local', host: '127.0.0.1', port: openPort };
    const result = await measureTarget(target, { attempts: 1, timeoutMs: 1000, delayMs: 0 });
    expect(result.target).toEqual(target);
  });

  it('grades an unreachable target as unusable', async () =>
  {
    const result = await measureTarget(
      { name: 'closed', host: '127.0.0.1', port: 1 },
      { attempts: 2, timeoutMs: 500, delayMs: 0 },
    );

    expect(result.statistics.lossPercent).toBe(100);
    expect(result.statistics.quality).toBe('unusable');
    expect(result.statistics.averageMs).toBeNull();
  });
});