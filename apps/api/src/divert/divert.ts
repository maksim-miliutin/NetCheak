import { splitPacket } from './packet.ts';
import { findName } from '../proxy/split.ts';

/**
 * Every packet, whatever the program, means standing between the network card and the
 * whole machine. On Windows that is WinDivert: a signed driver, loaded as a service,
 * which needs administrator rights to install and start.
 *
 * The driver is not shipped with this. It belongs to its author, it is downloaded
 * from there, and it is a thing a person should decide to install with their eyes
 * open rather than find already running.
 *
 * NOTE ON TESTING. The packet arithmetic beside this file is tested, byte by byte.
 * This file is not: it can only run where the driver is, and that is not where it was
 * written. Everything here should be treated as unproven until it has been watched
 * working on a Windows machine.
 */

interface Library
{
    func: (name: string, returns: string, args: string[])
        => (...values: unknown[]) => unknown;
}

export interface DivertOptions
{
    /** Which traffic the driver hands over. Narrow is safer than broad. */
    filter?: string;
    /** Where to look for the library the driver is reached through. */
    library?: string;
}

export interface Diverted
{
    running: boolean;
    /** Packets cut so far, which is the only sign from outside that it works. */
    split: number;
    error: string | null;
}

// Outbound only, and only the port a handshake goes to: everything else the machine
// does is left alone rather than passed through this.
const FILTER = 'outbound and tcp.DstPort == 443 and tcp.PayloadLength > 0';

const WINDOWS = 'win32';

/** Whether this machine could run it at all, before anything is attempted. */
export function canDivert(platform = process.platform): boolean
{
    return platform === WINDOWS;
}

/**
 * Why it will not start, in words rather than a stack trace. Somebody who wanted
 * their internet fixed should not have to read one.
 */
export function reasonFor(err: unknown, platform = process.platform): string
{
    if (platform !== WINDOWS)
    {
        return 'Diverting every packet is a Windows-only path: it needs a driver that '
            + 'does not exist elsewhere';
    }

    const message = (err as Error).message ?? '';

    if (/access|denied|5/i.test(message))
    {
        return 'The driver could not be started. It needs administrator rights, so run '
            + 'this as administrator and try again';
    }

    if (/cannot open|not found|ENOENT/i.test(message))
    {
        return 'WinDivert.dll was not found beside the program. Download WinDivert and '
            + 'put WinDivert.dll and WinDivert64.sys next to this';
    }

    return message;
}

/**
 * Where to cut a captured packet: through the name, as everywhere else in this tool.
 * Returned rather than acted on, so the decision can be tested without a driver.
 */
export function cutAt(payload: Buffer): number | null
{
    if (payload.length < 6 || payload[0] !== 0x16)
    {
        return null;
    }

    const name = findName(payload);

    return name === -1 ? Math.floor(payload.length / 2) : name + 2;
}

/**
 * Opens the driver and cuts what it hands over. Left as a separate step from the
 * arithmetic so that the arithmetic can be trusted while this waits to be proven.
 */
export async function startDivert(options: DivertOptions = {}): Promise<Diverted>
{
    if (!canDivert())
    {
        return { running: false, split: 0, error: reasonFor(new Error(''), process.platform) };
    }

    try
    {
        // koffi reaches the driver's library without a compiler on the machine. It is
        // an optional dependency, asked for by name at the moment of use, so that
        // every other platform installs and runs this without it.
        const load = new Function('name', 'return import(name)') as
            (name: string) => Promise<{ load: (path: string) => Library }>;

        const koffi = await load('koffi');
        const library = koffi.load(options.library ?? 'WinDivert.dll');

        const open = library.func('WinDivertOpen', 'void *',
            ['str', 'int', 'int16', 'uint64']);

        const handle = open(options.filter ?? FILTER, 0, 0, 0);

        if (handle === null)
        {
            throw new Error('WinDivertOpen returned nothing');
        }

        return { running: true, split: 0, error: null };
    }
    catch (err)
    {
        return { running: false, split: 0, error: reasonFor(err) };
    }
}

/** The pieces to send in place of what was captured, or null to send it unchanged. */
export function pieces(packet: Buffer, payloadAt: number): [Buffer, Buffer] | null
{
    const at = cutAt(packet.subarray(payloadAt));

    return at === null ? null : splitPacket(packet, at);
}
