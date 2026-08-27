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

export type Cause =
    | 'none'
    | 'never-checked'
    | 'link'
    | 'router'
    | 'provider'
    | 'dns'
    | 'sinkholed'
    | 'filtered'
    | 'handshake-cut'
    | 'remote'
    | 'unstable';

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

export interface Lookup
{
    server: string;
    addresses: string[];
    ms: number | null;
    error: string | null;
}

export type Agreement =
    | 'agree'
    | 'sinkholed'
    | 'differ'
    | 'system-fails'
    | 'public-fails'
    | 'both-fail'
    | 'unknown';

export interface DnsCheck
{
    name: string;
    system: Lookup | null;
    reference: Lookup;
    agreement: Agreement;
}

export type Handshake = 'completed' | 'reset' | 'refused' | 'timeout' | 'rejected';

export interface Certificate
{
    issuer: string;
    subject: string;
    names: string[];
    validTo: string;
    matchesHost: boolean;
}

export interface TlsCheck
{
    host: string;
    port: number;
    handshake: Handshake;
    ms: number | null;
    certificate: Certificate | null;
    error: string | null;
}

export interface Run
{
    checkedAt: string;
    lossPercent: number;
    averageMs: number | null;
}

export interface History
{
    targetId: number;
    name: string;
    runs: Run[];
    lossyRuns: number;
}
