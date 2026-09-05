import { execFile } from 'node:child_process';
import { getServers } from 'node:dns';
import { knock, knockedFor } from '../probe/knock.ts';
import { promisify } from 'node:util';

const run = promisify(execFile);

// A refused connection is not a failure: the machine answered with a reset, which
// proves it is there. Only silence leaves the question open, and that difference is
// what separates a dead router from a dead provider.
export type Answer = 'answered' | 'refused' | 'silent';

export interface Reach
{
    host: string;
    port: number;
    answer: Answer;
    latencyMs: number | null;
}

export interface Rings
{
    gateway: Reach | null;
    resolvers: Reach[];
}

const TIMEOUT_MS = 1500;

const GATEWAY_PORTS = [80, 443];

const RESOLVER_PORT = 53;

export async function probeRings(): Promise<Rings>
{
    const gateway = await findGateway();

    return {
        gateway: gateway === null ? null : await reachAny(gateway, GATEWAY_PORTS),
        resolvers: await Promise.all(localResolvers().map((host) => reach(host, RESOLVER_PORT))),
    };
}

/** Reads the default gateway out of whatever the platform calls its routing table. */
export async function findGateway(): Promise<string | null>
{
    try
    {
        const command = process.platform === 'win32'
            ? await run('route', ['print', '0.0.0.0'])
            : await run('ip', ['route']);

        return parseGateway(process.platform, command.stdout);
    }
    catch (err)
    {
        // No routing table means no gateway to name; the rest of the check still runs.
        return null;
    }
}

export function parseGateway(platform: string, output: string): string | null
{
    if (platform === 'win32')
    {
        // Windows prints a table where the default route is the row starting 0.0.0.0,
        // and the gateway is its third column.
        for (const line of output.split('\n'))
        {
            const columns = line.trim().split(/\s+/);

            if (columns[0] === '0.0.0.0' && columns[1] === '0.0.0.0' && columns[2] !== undefined)
            {
                return columns[2];
            }
        }

        return null;
    }

    // Either family may be the default route, and on a machine with both the fourth
    // is the one whose failure a person notices first.
    const match = /default via ([0-9a-f.:]+)/i.exec(output);

    return match === null ? null : (match[1] ?? null);
}

/** The resolvers the system itself uses, minus the loopback stubs that proxy them. */
/** A reset means the machine is there; anything else leaves it unproven. */
/** Kept as it was named here, now that the reading itself lives with the knock. */
export const outcomeFor = knockedFor;

export function localResolvers(): string[]
{
    return getServers()
        .map((server) => server.replace(/%.*$/, '').replace(/^\[|\]$/g, ''))
        .filter((server) => !server.startsWith('127.') && server !== '::1');
}

async function reachAny(host: string, ports: number[]): Promise<Reach>
{
    let last: Reach = { host, port: ports[0] ?? 0, answer: 'silent', latencyMs: null };

    for (const port of ports)
    {
        last = await reach(host, port);

        if (last.answer !== 'silent')
        {
            return last;
        }
    }

    return last;
}

export async function reach(host: string, port: number,
    timeoutMs = TIMEOUT_MS): Promise<Reach>
{
    const knocked = await knock(host, port, timeoutMs);

    return { host, port, answer: knocked.answer, latencyMs: knocked.latencyMs };
}
