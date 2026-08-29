export interface Resolved
{
    host: string;
    addresses: string[];
    /** Which resolver answered, or null when none did. */
    from: string | null;
    error: string | null;
}

export interface Answer
{
    Status?: number;
    Answer?: { type?: number; data?: string }[];
}

/**
 * Resolvers that answer over HTTPS. A hijacked reply is inserted into a plain lookup
 * on its way past; a lookup carried inside a connection to a known resolver cannot be
 * answered by anybody standing beside it.
 */
export const RESOLVERS =
[
    'https://cloudflare-dns.com/dns-query',
    'https://dns.google/resolve',
];

const A = 1;

const AAAA = 28;

const TIMEOUT_MS = 5000;

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export function askUrl(resolver: string, host: string, type: number): string
{
    const url = new URL(resolver);

    url.searchParams.set('name', host);
    url.searchParams.set('type', String(type));

    return url.toString();
}

/** Only the addresses; the rest of the reply is bookkeeping for the resolver. */
export function addressesIn(answer: Answer): string[]
{
    return (answer.Answer ?? [])
        .filter((one) => one.type === A || one.type === AAAA)
        .map((one) => one.data ?? '')
        .filter((data) => data !== '');
}

/**
 * Asks each resolver in turn until one answers. One being unreachable is the ordinary
 * case in the situation this tool is used in, so a single failure is not the end.
 */
export async function resolveOverHttps(
    host: string,
    fetcher: Fetcher = fetch,
    resolvers = RESOLVERS,
): Promise<Resolved>
{
    let last: string | null = null;

    for (const resolver of resolvers)
    {
        try
        {
            const addresses = await askOne(resolver, host, fetcher);

            if (addresses.length > 0)
            {
                return { host, addresses, from: new URL(resolver).host, error: null };
            }

            last = 'no addresses in the answer';
        }
        catch (err)
        {
            last = (err as Error).message;
        }
    }

    return { host, addresses: [], from: null, error: last ?? 'nobody answered' };
}

async function askOne(resolver: string, host: string, fetcher: Fetcher): Promise<string[]>
{
    const control = new AbortController();
    const stop = setTimeout(() => control.abort(), TIMEOUT_MS);

    try
    {
        const both = await Promise.all([A, AAAA].map(async (type) =>
        {
            const response = await fetcher(askUrl(resolver, host, type),
            {
                signal: control.signal,
                headers: { accept: 'application/dns-json' },
            });

            if (!response.ok)
            {
                return [];
            }

            return addressesIn(await response.json() as Answer);
        }));

        return both.flat();
    }
    finally
    {
        clearTimeout(stop);
    }
}
