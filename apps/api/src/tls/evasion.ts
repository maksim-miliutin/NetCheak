import { connect } from 'node:net';
import { buildHello } from './hello.ts';
import { WAYS, writeAs, type Way } from '../proxy/ways.ts';

export type Answered = 'greeted' | 'complained' | 'reset' | 'silent';

export interface Tried
{
    way: Way;
    answer: Answered;
}

export interface Evasion
{
    host: string;
    whole: Answered;
    split: Answered;
    /** Whether any way of writing got past what stopped the whole one. */
    splittingHelps: boolean;
    /** Every way tried, so a person can see which one to use. */
    tried: Tried[];
    /** The first way that worked, which is the one the proxy should use. */
    works: Way | null;
    error: string | null;
}

const PORT = 443;

const TIMEOUT_MS = 5000;

const GAP_MS = 60;

const GREETING = 0x16;

const COMPLAINT = 0x15;

/**
 * Whether the block in the way is one that splitting the write gets past. A filter
 * reads the wanted name out of a single packet; cut the write through that name and
 * there is no single packet to read. This measures whether that works here — it does
 * not do it for you, which would mean a driver in the kernel and the rights that come
 * with one.
 */
export async function tryEvasion(host: string, port = PORT): Promise<Evasion>
{
    try
    {
        const tried: Tried[] = [];

        // Every way, one at a time. Which one gets through depends on how the filter
        // in the way was built, and there is no telling that from here without asking.
        for (const way of WAYS)
        {
            tried.push({ way, answer: await sendHello(host, port, way) });
        }

        const whole = tried[0]?.answer ?? 'silent';
        const works = tried.find((one) => one.way !== 'whole' && one.answer === 'greeted');
        const split = tried.find((one) => one.way === 'name')?.answer ?? 'silent';

        return {
            host,
            whole,
            split,
            splittingHelps: whole !== 'greeted' && works !== undefined,
            tried,
            works: whole === 'greeted' ? null : works?.way ?? null,
            error: null,
        };
    }
    catch (err)
    {
        return { host, whole: 'silent', split: 'silent', splittingHelps: false,
            tried: [], works: null, error: (err as Error).message };
    }
}

/** What the first byte back says: a hello, a complaint, or nothing at all. */
export function readReply(first: number | undefined): Answered
{
    if (first === GREETING)
    {
        return 'greeted';
    }

    return first === COMPLAINT ? 'complained' : 'silent';
}

function sendHello(host: string, port: number, way: Way): Promise<Answered>
{
    return new Promise((resolve) =>
    {
        const hello = buildHello(host);
        const socket = connect(port, host);
        let answered: Answered | null = null;

        const finish = (answer: Answered): void =>
        {
            if (answered !== null)
            {
                return;
            }

            answered = answer;
            socket.destroy();
            resolve(answer);
        };

        socket.setTimeout(TIMEOUT_MS);

        socket.once('connect', () =>
        {
            const { pieces } = writeAs(way, hello);

            pieces.forEach((piece, index) =>
            {
                if (index === 0)
                {
                    socket.write(piece);

                    return;
                }

                setTimeout(() => socket.write(piece), GAP_MS * index);
            });
        });

        socket.once('data', (chunk: Buffer) => finish(readReply(chunk[0])));
        socket.once('timeout', () => finish('silent'));
        socket.once('close', () => finish('silent'));

        socket.once('error', (err: NodeJS.ErrnoException) =>
            finish(err.code === 'ECONNRESET' ? 'reset' : 'silent'));
    });
}
