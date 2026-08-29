import { execFile } from 'node:child_process';
import { reasonFor } from './missing.ts';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface Hop
{
    number: number;
    host: string | null;
    address: string | null;
    /** Milliseconds for each probe, with null where nothing came back. */
    times: (number | null)[];
}

export interface Trace
{
    target: string;
    hops: Hop[];
    /** Where the path stops answering, if it does before the target. */
    silentFrom: number | null;
    /** Why there is nothing to show, when there is nothing to show. */
    error: string | null;
}

const MAX_HOPS = 15;

const TIMEOUT_MS = 40_000;

/**
 * Runs the traceroute the system already has. Sending packets with a shortened life
 * of our own would need a raw socket, and that needs privileges this tool refuses to
 * ask for; the utility is installed everywhere and answers the same question.
 */
export async function traceTo(host: string): Promise<Trace>
{
    const windows = process.platform === 'win32';

    const args = windows
        ? ['-d', '-h', String(MAX_HOPS), '-w', '1500', host]
        : ['-n', '-m', String(MAX_HOPS), '-w', '2', host];

    try
    {
        const command = windows ? 'tracert' : 'traceroute';
        const { stdout } = await run(command, args, { timeout: TIMEOUT_MS });

        return read(host, parseHops(stdout));
    }
    catch (err)
    {
        // A traceroute that dies partway still printed the hops it reached.
        const output = (err as { stdout?: string }).stdout ?? '';
        const hops = parseHops(output);

        return hops.length > 0 ? read(host, hops) : read(host, [], reasonFor(err, 'traceroute'));
    }
}

/**
 * Both utilities print one line per hop, a number then the replies. Windows puts the
 * address last and writes a timeout as a star; the unix one puts the address first
 * and prints a bare star per lost probe.
 */
export function parseHops(output: string): Hop[]
{
    const hops: Hop[] = [];

    for (const line of output.split('\n'))
    {
        const trimmed = line.trim();
        const start = /^(\d{1,2})\s+(.*)$/.exec(trimmed);

        if (start === null)
        {
            continue;
        }

        const rest = start[2] ?? '';

        hops.push({
            number: Number(start[1]),
            host: null,
            address: addressIn(rest),
            times: timesIn(rest),
        });
    }

    return hops;
}

/** The first thing on the line that looks like an address, in either family. */
export function addressIn(rest: string): string | null
{
    const four = /\b\d{1,3}(?:\.\d{1,3}){3}\b/.exec(rest);

    if (four !== null)
    {
        return four[0];
    }

    const six = /\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/i.exec(rest);

    return six === null ? null : six[0];
}

/** A time per probe, with null where the utility printed a star instead. */
export function timesIn(rest: string): (number | null)[]
{
    const times: (number | null)[] = [];
    const token = /(\*)|(?:<?\s*(\d+(?:\.\d+)?)\s*ms)/gi;

    let found = token.exec(rest);

    while (found !== null)
    {
        times.push(found[1] === '*' ? null : Number(found[2]));
        found = token.exec(rest);
    }

    return times;
}

/**
 * The first hop that answers nothing, with nothing answering after it either. A single
 * quiet hop in the middle is ordinary: plenty of routers decline to reply while still
 * passing traffic along.
 */
export function silenceFrom(hops: Hop[]): number | null
{
    let candidate: number | null = null;

    for (const hop of hops)
    {
        const answered = hop.times.some((time) => time !== null);

        if (answered)
        {
            candidate = null;
            continue;
        }

        if (candidate === null)
        {
            candidate = hop.number;
        }
    }

    return candidate;
}

function read(target: string, hops: Hop[], error: string | null = null): Trace
{
    return { target, hops, silentFrom: silenceFrom(hops), error };
}

