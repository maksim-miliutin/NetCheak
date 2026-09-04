import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { choosePort, isFree } from './port.ts';

const held: Server[] = [];

// The numbers here are below the range the system hands out to anything asking for
// a port. They used to sit inside it, and a test opening a socket somewhere else in
// the suite would occasionally be given one of ours.
//
// Waiting only for success on top of that meant waiting forever: the suite failed
// with a timeout on a test about nothing rather than saying the port was taken.
function hold(port: number): Promise<void>
{
    return new Promise((resolve, reject) =>
    {
        const server = createServer();

        held.push(server);
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve());
    });
}

afterEach(() =>
{
    for (const server of held.splice(0))
    {
        server.close();
    }
});

describe('isFree', () =>
{
    it('says a port nobody holds is free', async () =>
    {
        expect(await isFree(18401)).toBe(true);
    });

    it('says a held port is not', async () =>
    {
        await hold(18402);

        expect(await isFree(18402)).toBe(false);
    });

    // The probe has to let go before answering, or the caller finds its own probe.
    it('lets go of the port it tested', async () =>
    {
        expect(await isFree(18403)).toBe(true);
        expect(await isFree(18403)).toBe(true);
    });
});

describe('choosePort', () =>
{
    it('takes the port asked for when it is free', async () =>
    {
        expect(await choosePort(18410)).toEqual({ port: 18410, skipped: 0 });
    });

    // Running the binary twice was a stack trace and nothing else.
    it('steps past a port somebody else holds', async () =>
    {
        await hold(18420);

        expect(await choosePort(18420)).toEqual({ port: 18421, skipped: 1 });
    });

    it('counts every port it stepped past', async () =>
    {
        await hold(18430);
        await hold(18431);

        expect(await choosePort(18430)).toEqual({ port: 18432, skipped: 2 });
    });

    it('gives up rather than searching forever', async () =>
    {
        await hold(18440);

        await expect(choosePort(18440, 1)).rejects.toThrow('No free port');
    });
});
