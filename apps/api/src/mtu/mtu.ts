import { execFile } from 'node:child_process';
import { reasonFor } from '../route/missing.ts';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type Passage = 'through' | 'too-big' | 'silent';

export interface Path
{
    host: string;
    /** Largest packet that crossed whole, headers included. */
    mtu: number | null;
    /** What the link is expected to carry, for the reading below to lean on. */
    ordinary: number;
    error: string | null;
}

/** Twenty bytes of address header and eight of echo header ride with every payload. */
export const HEADERS = 28;

export const ORDINARY = 1500;

const FLOOR = 576;

const TIMEOUT_MS = 20_000;

/**
 * Pages open and large files stall: the usual cause is a packet size the path will not
 * carry whole, dropped instead of broken up. Finding the edge by hand is tedious, and
 * no ordinary speed test shows it at all.
 */
export async function findMtu(host: string): Promise<Path>
{
    try
    {
        const fits = async (payload: number): Promise<boolean> =>
            await sendOne(host, payload) === 'through';

        if (!await fits(FLOOR - HEADERS))
        {
            return { host, mtu: null, ordinary: ORDINARY, error: 'Nothing came back at all' };
        }

        const payload = await searchLargest(FLOOR - HEADERS, ORDINARY - HEADERS, fits);

        return { host, mtu: payload + HEADERS, ordinary: ORDINARY, error: null };
    }
    catch (err)
    {
        return { host, mtu: null, ordinary: ORDINARY, error: reasonFor(err, 'ping') };
    }
}

/**
 * Halving the range rather than walking it: an eleven step search over a thousand
 * sizes, where one at a time would be a thousand round trips.
 */
export async function searchLargest(
    low: number,
    high: number,
    fits: (size: number) => Promise<boolean>,
): Promise<number>
{
    let smallest = low;
    let largest = high;

    while (smallest < largest)
    {
        // Rounded up, or a range of two would test the size already known to pass and
        // never move.
        const middle = Math.ceil((smallest + largest) / 2);

        if (await fits(middle))
        {
            smallest = middle;
            continue;
        }

        largest = middle - 1;
    }

    return smallest;
}

/**
 * Both utilities say the same three things differently. A packet refused for its size
 * is the answer being looked for; silence is a path that says nothing either way.
 */
export function readPing(output: string, code: number | null): Passage
{
    const said = output.toLowerCase();

    if (/needs to be fragmented|message too long|frag needed|packet too big/.test(said))
    {
        return 'too-big';
    }

    if (/100% packet loss|100% loss|request timed out|general failure/.test(said))
    {
        return 'silent';
    }

    return code === 0 ? 'through' : 'silent';
}

async function sendOne(host: string, payload: number): Promise<Passage>
{
    const windows = process.platform === 'win32';

    const args = windows
        ? ['-n', '1', '-w', '1500', '-f', '-l', String(payload), host]
        : ['-c', '1', '-W', '2', '-M', 'do', '-s', String(payload), host];

    try
    {
        const { stdout } = await run('ping', args, { timeout: TIMEOUT_MS });

        return readPing(stdout, 0);
    }
    catch (err)
    {
        const output = (err as { stdout?: string }).stdout ?? '';
        const code = (err as { code?: number }).code ?? null;

        if (output === '' && (err as NodeJS.ErrnoException).code === 'ENOENT')
        {
            throw err;
        }

        return readPing(output, typeof code === 'number' ? code : null);
    }
}

