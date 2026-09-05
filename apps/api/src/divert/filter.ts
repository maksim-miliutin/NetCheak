/**
 * What the driver is handed and what it never sees.
 *
 * The filter decides whose packets this program touches, and it lived as a template
 * string inside a script that only runs on Windows with a driver loaded — which is
 * to say it was never checked at all. It let through everything a machine says to
 * itself, and a copy sent into a conversation between two programs on one machine
 * breaks it for no gain: there is no filter out there to fool.
 */

export interface Watching
{
    /** The range of ports a call is carried on, at either end. */
    from: number;
    to: number;
}

/**
 * Loopback in the shape WinDivert writes it. Named rather than repeated so the two
 * halves cannot drift apart.
 */
const LOCAL = '127.0.0.1';

export function filterFor({ from, to }: Watching): string
{
    const parts =
    [
        // A packet this program sends comes back through this same filter, and a copy
        // of a copy is what the log filled up with.
        'outbound',
        'not impostor',

        // Nothing that never leaves this machine. Programs talk to each other over
        // loopback on whatever port they were given, and the high ones fall inside
        // the range watched for calls.
        `ip.DstAddr != ${LOCAL}`,
        `ip.SrcAddr != ${LOCAL}`,

        // Both ends of a call are checked: it is given a port by the far end and
        // answers from one of its own, and only the near one turned out to be high.
        '('
            + 'tcp.DstPort == 443 and tcp.PayloadLength > 0'
            + ` or (udp.SrcPort >= ${from} and udp.SrcPort <= ${to})`
            + ` or (udp.DstPort >= ${from} and udp.DstPort <= ${to})`
            + ')',
    ];

    return parts.join(' and ');
}
