import type
{
    DnsCheck,
    Health,
    History,
    Status,
    TlsCheck,
    Path,
    Cut,
    Evasion,
    Household,
    Newer,
    Outbound,
    ProxyState,
    SixthCheck,
    Trace,
    Tunnels,
    Verdict,
} from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T>
{
    const response = await fetch(`/api${path}`, init);

    if (!response.ok)
    {
        // The server answers errors in one shape, so the message is worth reading
        // before falling back to a status code nobody can act on.
        type Failure = { error?: { message: string } } | null;
        const body = await response.json().catch(() => null) as Failure;

        throw new Error(body?.error?.message ?? `Request failed with ${response.status}`);
    }

    return await response.json() as T;
}

export const getHealth = (): Promise<Health> => request<Health>('/health');

export const getStatus = (): Promise<Status> => request<Status>('/status');

export const runDns = (): Promise<DnsCheck> =>
    request<DnsCheck>('/dns', { method: 'POST' });

export interface TlsResult
{
    checks: TlsCheck[];
    verdict: Verdict;
}

export const runTls = (): Promise<TlsResult> => request<TlsResult>('/tls', { method: 'POST' });

export const watchTarget = (target: string): Promise<unknown> =>
    request<unknown>('/targets',
    {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target }),
    });

export const forgetTarget = (id: number): Promise<unknown> =>
    request<unknown>(`/targets/${id}`, { method: 'DELETE' });

export const getHistory = (): Promise<{ targets: History[] }> =>
    request<{ targets: History[] }>('/history');

export const traceTo = (target: string): Promise<Trace> =>
    request<Trace>('/trace',
    {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target }),
    });

export async function getReport(): Promise<string>
{
    const response = await fetch('/api/report');

    if (!response.ok)
    {
        throw new Error(`Report failed with ${response.status}`);
    }

    return await response.text();
}

export const getTunnels = (): Promise<Tunnels> => request<Tunnels>('/tunnels');

export const measureMtu = (target: string): Promise<Path> =>
    request<Path>('/mtu',
    {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target }),
    });

export const checkSixth = (): Promise<SixthCheck> =>
    request<SixthCheck>('/sixth', { method: 'POST' });

export const getNeighbours = (): Promise<Household> => request<Household>('/neighbours');

export const findCut = (target: string): Promise<Cut> =>
    request<Cut>('/cut',
    {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target }),
    });

export const getOutbound = (): Promise<Outbound> => request<Outbound>('/outbound');

export const checkUpdate = (): Promise<Newer> =>
    request<Newer>('/update', { method: 'POST' });

export const tryEvasion = (target: string): Promise<Evasion> =>
    request<Evasion>('/evasion',
    {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target }),
    });

export const getProxy = (): Promise<ProxyState> => request<ProxyState>('/proxy');

export const toggleProxy = (way?: string): Promise<ProxyState> =>
    request<ProxyState>('/proxy',
    {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(way === undefined ? {} : { way }),
    });

export const runSpeed = (): Promise<unknown> => request<unknown>('/speed', { method: 'POST' });

export const runCheck = (): Promise<{ checkId: number }> =>
    request<{ checkId: number }>('/checks',
    {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attempts: 5, timeoutMs: 2000 }),
    });
