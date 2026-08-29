export interface Newer
{
    current: string;
    latest: string | null;
    /** True only when the fetched version is genuinely ahead of this one. */
    behind: boolean;
    error: string | null;
}

const RELEASES = 'https://api.github.com/repos/maksim-miliutin/netcheck/releases/latest';

const TIMEOUT_MS = 6000;

/**
 * Compares two versions by their numbers rather than as text. Ten is greater than
 * nine, and comparing "1.10.0" with "1.9.0" as strings says the opposite: this is the
 * mistake that tells people to downgrade.
 */
export function isNewer(candidate: string, current: string): boolean
{
    const left = numbersIn(candidate);
    const right = numbersIn(current);

    for (let i = 0; i < Math.max(left.length, right.length); i += 1)
    {
        const a = left[i] ?? 0;
        const b = right[i] ?? 0;

        if (a !== b)
        {
            return a > b;
        }
    }

    return false;
}

/** A version may be written with a v in front, and a release may carry a suffix. */
export function numbersIn(version: string): number[]
{
    const cleaned = version.trim().replace(/^v/i, '').split(/[-+]/)[0] ?? '';

    return cleaned.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Asks whether a newer release exists. Nothing is sent but the request itself, and
 * this only happens when the person turns it on: a tool that promises no telemetry
 * cannot quietly phone home, however good the reason.
 */
export async function checkUpdate(current: string, fetcher: Fetcher = fetch): Promise<Newer>
{
    const control = new AbortController();
    const stop = setTimeout(() => control.abort(), TIMEOUT_MS);

    try
    {
        const response = await fetcher(RELEASES,
        {
            signal: control.signal,
            headers: { accept: 'application/vnd.github+json' },
        });

        if (!response.ok)
        {
            const error = `Asked and got ${response.status}`;

            return { current, latest: null, behind: false, error };
        }

        const body = await response.json() as { tag_name?: string };
        const latest = body.tag_name ?? null;

        if (latest === null)
        {
            return { current, latest: null, behind: false, error: 'No version in the answer' };
        }

        return { current, latest, behind: isNewer(latest, current), error: null };
    }
    catch (err)
    {
        return { current, latest: null, behind: false, error: (err as Error).message };
    }
    finally
    {
        clearTimeout(stop);
    }
}

export const RELEASES_URL = RELEASES;
