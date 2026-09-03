import { connect } from 'node:tls';
import { reach, type Answer } from '../route/rings.ts';
import { readHandshake, type Handshake } from './handshake.ts';

export type Culprit =
    | 'open'
    | 'name-read'
    | 'address-blocked'
    | 'site-down'
    | 'unclear';

export interface Cut
{
    host: string;
    /** Whether a plain connection to the address opens at all. */
    tcp: Answer;
    /** The handshake that says which site is wanted. */
    named: Handshake;
    /** The same handshake with the name left out. */
    unnamed: Handshake;
    culprit: Culprit;
}

const PORT = 443;

const TIMEOUT_MS = 4000;

/**
 * Where a cut comes from, as far as three attempts can say. The layered checks report
 * that a site will not open; this separates a site that is down from one that
 * something along the way objects to by name.
 */
export async function findCut(host: string, port = PORT): Promise<Cut>
{
    const opened = await reach(host, port);

    if (opened.answer !== 'answered')
    {
        return { host, tcp: opened.answer, named: 'timeout', unnamed: 'timeout',
            culprit: opened.answer === 'refused' ? 'site-down' : 'address-blocked' };
    }

    const [named, unnamed] = await Promise.all(
    [
        shake(host, port, host),
        shake(host, port, null),
    ]);

    return { host, tcp: opened.answer, named, unnamed, culprit: blame(named, unnamed) };
}

/**
 * A connection that opens, then survives a handshake without the name and dies with
 * it, was cut by something that read the name and objected. Nothing else explains the
 * difference: the packets, the address and the port are identical either way.
 */
export function blame(named: Handshake, unnamed: Handshake): Culprit
{
    if (named === 'completed')
    {
        return 'open';
    }

    if (named === 'reset' && unnamed === 'completed')
    {
        return 'name-read';
    }

    // Both dying the same way says the name made no difference. Silence counts as a
    // way of dying: a filter that drops rather than resets is still a filter, and a
    // live connection that answers nothing twice has already said what it is.
    if (named === unnamed && (named === 'reset' || named === 'timeout'))
    {
        return 'address-blocked';
    }

    return 'unclear';
}

/** The name is what the far end is told it should answer for, and what a filter reads. */
function shake(host: string, port: number, servername: string | null): Promise<Handshake>
{
    return new Promise((resolve) =>
    {
        let settled = false;

        const socket = connect({
            host,
            port,
            rejectUnauthorized: false,
            ...(servername === null ? {} : { servername }),
        });

        const finish = (answer: Handshake): void =>
        {
            if (settled)
            {
                return;
            }

            settled = true;
            socket.destroy();
            resolve(answer);
        };

        socket.setTimeout(TIMEOUT_MS);
        socket.once('secureConnect', () => finish('completed'));
        socket.once('timeout', () => finish('timeout'));
        socket.once('error', (err: NodeJS.ErrnoException) => finish(readHandshake(err.code)));
    });
}
