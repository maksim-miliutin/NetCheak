import { knock } from './knock.ts';
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

export async function probeOnce(host: string, port: number,
    timeoutMs: number): Promise<Sample>
{
    const knocked = await knock(host, port, timeoutMs);

    if (knocked.answer === 'answered')
    {
        return { reachable: true, latencyMs: knocked.latencyMs, error: null };
    }

    // A refusal reached a machine, and this call does not care which kind of
    // not-reachable it was: the statistics beside it count what came back.
    return { reachable: false, latencyMs: null, error: knocked.code ?? 'unreachable' };
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