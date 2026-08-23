import { Resolver } from 'node:dns/promises';
import { localResolvers } from '../route/rings.ts';

export interface Lookup
{
    server: string;
    addresses: string[];
    ms: number | null;
    error: string | null;
}

export type Agreement =
    | 'agree'
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

// A name that resolves everywhere and belongs to nobody in particular, so a wrong
// answer says something about the resolver rather than about the site being down.
const PROBE_NAME = 'example.com';

const REFERENCE = '1.1.1.1';

const TIMEOUT_MS = 3000;

export async function checkDns(name = PROBE_NAME): Promise<DnsCheck>
{
    const system = localResolvers();

    const [first, reference] = await Promise.all(
    [
        system.length === 0 ? Promise.resolve(null) : askServer(system[0] ?? '', name),
        askServer(REFERENCE, name),
    ]);

    return { name, system: first, reference, agreement: compare(first, reference) };
}

/**
 * Two resolvers answering differently is the interesting case: the packets travel,
 * the lookup works, and yet the address is not the same one everybody else gets.
 */
export function compare(system: Lookup | null, reference: Lookup): Agreement
{
    if (system === null)
    {
        return 'unknown';
    }

    const systemFailed = system.error !== null || system.addresses.length === 0;
    const referenceFailed = reference.error !== null || reference.addresses.length === 0;

    if (systemFailed && referenceFailed)
    {
        return 'both-fail';
    }

    if (systemFailed)
    {
        return 'system-fails';
    }

    if (referenceFailed)
    {
        return 'public-fails';
    }

    const shared = system.addresses.some((address) => reference.addresses.includes(address));

    return shared ? 'agree' : 'differ';
}

async function askServer(server: string, name: string): Promise<Lookup>
{
    const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 1 });
    const started = performance.now();

    try
    {
        resolver.setServers([server]);

        const addresses = await resolver.resolve4(name);

        return { server, addresses, ms: Math.round(performance.now() - started), error: null };
    }
    catch (err)
    {
        const code = (err as NodeJS.ErrnoException).code ?? (err as Error).message;

        return { server, addresses: [], ms: null, error: code };
    }
}
