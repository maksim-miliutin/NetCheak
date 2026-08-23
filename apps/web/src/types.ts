export interface SamplePoint
{
    reachable: boolean;
    latencyMs: number | null;
}

export interface StatusRow
{
    targetId: number;
    name: string;
    host: string;
    port: number;
    lossPercent: number | null;
    averageMs: number | null;
    jitterMs: number | null;
    quality: string | null;
    checkedAt: string | null;
    samples: SamplePoint[];
}

export type Level = 'ok' | 'warn' | 'down' | 'unknown';

export type Cause = 'none' | 'never-checked' | 'link' | 'dns' | 'remote' | 'unstable';

export interface Verdict
{
    level: Level;
    cause: Cause;
    reachable: number;
    total: number;
    blame: string[];
}

export interface SpeedRow
{
    measuredAt: string;
    source: string;
    downloadMbps: number | null;
    uploadMbps: number | null;
    streams: number;
}

export interface Status
{
    verdict: Verdict;
    targets: StatusRow[];
    speed: SpeedRow | null;
}

export interface Health
{
    status: string;
    database: { reachable: boolean; latencyMs?: number };
}
