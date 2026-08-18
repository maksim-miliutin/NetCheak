export interface Sample
{
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
}

export type Quality = 'unusable' | 'poor' | 'fair' | 'good';

export interface Statistics
{
  sent: number;
  received: number;
  lossPercent: number;
  minimumMs: number | null;
  averageMs: number | null;
  maximumMs: number | null;
  medianMs: number | null;
  jitterMs: number | null;
  quality: Quality;
}

const round = (value: number): number => Math.round(value * 100) / 100;

export function computeStatistics(samples: Sample[]): Statistics
{
  const timings = samples
    .filter((sample) => sample.reachable)
    .map((sample) => sample.latencyMs)
    .filter((latency): latency is number => latency !== null);

  const sent = samples.length;
  const received = timings.length;
  const lossPercent = sent === 0 ? 0 : round(((sent - received) / sent) * 100);

  if (received === 0)
  {
    return {
      sent,
      received,
      lossPercent,
      minimumMs: null,
      averageMs: null,
      maximumMs: null,
      medianMs: null,
      jitterMs: null,
      quality: 'unusable',
    };
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];

  const total = timings.reduce((sum, latency) => sum + latency, 0);

  let jitter = 0;
  if (timings.length > 1)
  {
    let spread = 0;
    for (let i = 1; i < timings.length; i += 1)
    {
      spread += Math.abs(timings[i] - timings[i - 1]);
    }
    jitter = spread / (timings.length - 1);
  }

  const statistics: Statistics = {
    sent,
    received,
    lossPercent,
    minimumMs: round(sorted[0]),
    averageMs: round(total / received),
    maximumMs: round(sorted[sorted.length - 1]),
    medianMs: round(median),
    jitterMs: round(jitter),
    quality: 'good',
  };

  statistics.quality = gradeQuality(statistics);
  return statistics;
}

export function gradeQuality(statistics: Statistics): Quality
{
  if (statistics.received === 0)
  {
    return 'unusable';
  }

  const average = statistics.averageMs ?? 0;
  const jitter = statistics.jitterMs ?? 0;

  if (statistics.lossPercent > 20 || average > 400 || jitter > 150)
  {
    return 'poor';
  }

  if (statistics.lossPercent > 2 || average > 150 || jitter > 50)
  {
    return 'fair';
  }

  return 'good';
}