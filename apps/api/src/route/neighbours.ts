import { execFile } from 'node:child_process';
import { reasonFor } from './missing.ts';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface Neighbour
{
    address: string;
    hardware: string;
    /** True for the gateway, which is the one machine here that is not a neighbour. */
    gateway: boolean;
}

export interface Household
{
    neighbours: Neighbour[];
    error: string | null;
}

const TIMEOUT_MS = 10_000;

// Addresses the machine broadcasts to rather than talks to, plus the ones a table
// keeps for its own bookkeeping.
const NOT_A_DEVICE = /^(ff|01:00:5e|33:33|00:00:00:00:00:00)/i;

/**
 * Everything already on this network, out of the table the system keeps of who it has
 * spoken to. A house with a dozen devices and an evening of stuttering usually has an
 * answer here, and nothing else in the tool can look for it.
 */
export async function findNeighbours(gateway: string | null): Promise<Household>
{
    const windows = process.platform === 'win32';

    try
    {
        const { stdout } = windows
            ? await run('arp', ['-a'], { timeout: TIMEOUT_MS })
            : await run('ip', ['neigh'], { timeout: TIMEOUT_MS });

        return { neighbours: parseNeighbours(stdout, gateway), error: null };
    }
    catch (err)
    {
        return { neighbours: [], error: reasonFor(err, 'table of neighbours') };
    }
}

/**
 * Both tables put an address and a hardware address on the same line, one separated
 * by dashes and the other by colons. Everything else on the line differs and none of
 * it is needed.
 */
export function parseNeighbours(output: string, gateway: string | null): Neighbour[]
{
    const found: Neighbour[] = [];
    const seen = new Set<string>();

    for (const line of output.split('\n'))
    {
        const address = /\b\d{1,3}(?:\.\d{1,3}){3}\b/.exec(line);
        const hardware = /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/i.exec(line);

        if (address === null || hardware === null)
        {
            continue;
        }

        const plain = hardware[0].toLowerCase().replace(/-/g, ':');

        if (NOT_A_DEVICE.test(plain) || seen.has(address[0]))
        {
            continue;
        }

        seen.add(address[0]);
        found.push({ address: address[0], hardware: plain, gateway: address[0] === gateway });
    }

    return found;
}

