import { Socket } from 'node:net';

/**
 * Knocking on a port and saying what came back. Two places wrote the same twenty
 * lines of it and differed only in the shape they wanted the answer in.
 */

export type Knocked = 'answered' | 'refused' | 'silent';

export interface Knock
{
    answer: Knocked;

    // A refusal is timed too: the far end answered, it just said no. Silence has
    // nothing to time.
    latencyMs: number | null;
    code: string | null;
}

/** A refusal is a machine that answered. Everything else is silence. */
export function knockedFor(code: string | undefined): Knocked
{
    return code === 'ECONNREFUSED' || code === 'ECONNRESET' ? 'refused' : 'silent';
}

export function knock(host: string, port: number, timeoutMs: number): Promise<Knock>
{
    return new Promise((resolve) =>
    {
        const socket = new Socket();
        const started = performance.now();

        let settled = false;

        const finish = (knocked: Knock): void =>
        {
            if (settled)
            {
                return;
            }

            settled = true;
            socket.destroy();
            resolve(knocked);
        };

        socket.setTimeout(timeoutMs);

        socket.once('connect', () => finish(
        {
            answer: 'answered',
            latencyMs: performance.now() - started,
            code: null,
        }));

        socket.once('timeout', () => finish(
        {
            answer: 'silent',
            latencyMs: null,
            code: 'timeout',
        }));

        socket.once('error', (error: NodeJS.ErrnoException) =>
        {
            const answer = knockedFor(error.code);

            finish(
            {
                answer,
                latencyMs: answer === 'refused' ? performance.now() - started : null,
                code: error.code ?? null,
            });
        });

        socket.connect(port, host);
    });
}
