import type { DnsCheck, Health, Status, TlsCheck, Verdict } from './types';

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

export const runSpeed = (): Promise<unknown> => request<unknown>('/speed', { method: 'POST' });

export const runCheck = (): Promise<{ checkId: number }> =>
    request<{ checkId: number }>('/checks',
    {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attempts: 5, timeoutMs: 2000 }),
    });
