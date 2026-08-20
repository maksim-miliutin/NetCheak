import { Socket } from 'node:net';
import { computeStatistics, type Sample, type Statistics } from './statistics.ts';

export interface Target
{
  name: string;
  host: string;
  port: number;
}

export interface ProbeOptions
{
  attempts: number;
  timeoutMs: number;
  delayMs?: number;
}

export interface TargetResult
{
  target: Target;
  samples: Sample[];
  statistics: Statistics;
}

export function probeOnce(host: string, port: number, timeoutMs: number): Promise<Sample>
{
  return new Promise((resolve) =>
  {
    const socket = new Socket();
    const started = performance.now();
    let settled = false;

    const finish = (sample: Sample): void =>
    {
      if (settled)
      {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(sample);
    };

    socket.setTimeout(timeoutMs);

    socket.once('connect', () => finish({
      reachable: true,
      latencyMs: performance.now() - started,
      error: null,
    }));

    socket.once('timeout', () => finish({
      reachable: false,
      latencyMs: null,
      error: 'timeout',
    }));

    socket.once('error', (error: NodeJS.ErrnoException) => finish({
      reachable: false,
      latencyMs: null,
      error: error.code ?? error.message,
    }));

    socket.connect(port, host);
  });
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function measureTarget(target: Target, options: ProbeOptions): Promise<TargetResult>
{
  const samples: Sample[] = [];
  const delayMs = options.delayMs ?? 200;

  for (let attempt = 0; attempt < options.attempts; attempt += 1)
  {
    samples.push(await probeOnce(target.host, target.port, options.timeoutMs));

    if (attempt + 1 < options.attempts)
    {
      await wait(delayMs);
    }
  }

  return { target, samples, statistics: computeStatistics(samples) };
}