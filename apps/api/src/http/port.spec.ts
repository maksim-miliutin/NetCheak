import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { choosePort, isFree } from './port.ts';

const held: Server[] = [];

function hold(port: number): Promise<void>
{
    return new Promise((resolve) =>
    {
        const server = createServer();
        held.push(server);
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
        expect(await isFree(38401)).toBe(true);
    });

    it('says a held port is not', async () =>
    {
        await hold(38402);

        expect(await isFree(38402)).toBe(false);
    });

    // The probe has to let go before answering, or the caller finds its own probe.
    it('lets go of the port it tested', async () =>
    {
        expect(await isFree(38403)).toBe(true);
        expect(await isFree(38403)).toBe(true);
    });
});

describe('choosePort', () =>
{
    it('takes the port asked for when it is free', async () =>
    {
        expect(await choosePort(38410)).toEqual({ port: 38410, skipped: 0 });
    });

    // Running the binary twice was a stack trace and nothing else.
    it('steps past a port somebody else holds', async () =>
    {
        await hold(38420);

        expect(await choosePort(38420)).toEqual({ port: 38421, skipped: 1 });
    });

    it('counts every port it stepped past', async () =>
    {
        await hold(38430);
        await hold(38431);

        expect(await choosePort(38430)).toEqual({ port: 38432, skipped: 2 });
    });

    it('gives up rather than searching forever', async () =>
    {
        await hold(38440);

        await expect(choosePort(38440, 1)).rejects.toThrow('No free port');
    });
});
