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

export interface Hop
{
    number: number;
    host: string | null;
    address: string | null;
    times: (number | null)[];
}

export interface Trace
{
    target: string;
    hops: Hop[];
    silentFrom: number | null;
    error: string | null;
}

export interface Adapter
{
    name: string;
    addresses: string[];
    tunnel: boolean;
}

export interface Tunnels
{
    adapters: Adapter[];
    tunnelling: string[];
}

export interface Path
{
    host: string;
    mtu: number | null;
    ordinary: number;
    error: string | null;
}

export type Sixth = 'absent' | 'link-local-only' | 'working' | 'broken';

export interface SixthCheck
{
    state: Sixth;
    addresses: string[];
    answer: string | null;
    ms: number | null;
}

export interface Neighbour
{
    address: string;
    hardware: string;
    gateway: boolean;
}

export interface Household
{
    neighbours: Neighbour[];
    error: string | null;
}

export type Culprit = 'open' | 'name-read' | 'address-blocked' | 'site-down' | 'unclear';

export interface Cut
{
    host: string;
    tcp: string;
    named: string;
    unnamed: string;
    culprit: Culprit;
}

export interface Errand
{
    where: string;
    why: string;
    onDemand: boolean;
}

export interface Outbound
{
    errands: Errand[];
    never: string[];
}

export interface Newer
{
    current: string;
    latest: string | null;
    behind: boolean;
    error: string | null;
}

export interface Evasion
{
    host: string;
    whole: string;
    split: string;
    splittingHelps: boolean;
    tried: Tried[];
    works: string | null;
    error: string | null;
}

export interface Relay
{
    way: string;
    port: number;
}

export interface Preset
{
    id: string;
    way: string;
    overHttps: boolean;
    gapMs: number;
}

export interface ProxyState
{
    running: boolean;
    relays: Relay[];
    preset: string | null;
    presets: Preset[];
    ways: string[];
    overHttps: boolean;
    system: boolean;
    systemError: string | null;
    onNetwork: boolean;
    lan: string | null;
}

export interface Tried
{
    way: string;
    answer: string;
}
