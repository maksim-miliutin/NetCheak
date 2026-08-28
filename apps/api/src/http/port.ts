import { createServer } from 'node:net';

export interface Chosen
{
    port: number;
    /** How many ports were taken before this one, so the caller can say so. */
    skipped: number;
}

const TRIES = 20;

/**
 * A person who runs the binary twice, or who already has something on the port, was
 * shown a stack trace and left to work it out. The next free port is found instead,
 * and the caller says which one it landed on.
 */
export async function choosePort(wanted: number, tries = TRIES): Promise<Chosen>
{
    for (let offset = 0; offset < tries; offset += 1)
    {
        const port = wanted + offset;

        if (await isFree(port))
        {
            return { port, skipped: offset };
        }
    }

    throw new Error(`No free port between ${wanted} and ${wanted + tries - 1}`);
}

export function isFree(port: number): Promise<boolean>
{
    return new Promise((resolve) =>
    {
        const probe = createServer();

        probe.once('error', () => resolve(false));

        probe.once('listening', () =>
        {
            // Closed before the answer is given, so the caller finds it free too.
            probe.close(() => resolve(true));
        });

        probe.listen(port, '127.0.0.1');
    });
}
