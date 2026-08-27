import { describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { outcomeFor, parseGateway, reach } from './rings.ts';

const WINDOWS_ROUTE = `
===========================================================================
Active Routes:
Network Destination        Netmask          Gateway       Interface  Metric
          0.0.0.0          0.0.0.0      192.168.1.1     192.168.1.42     35
===========================================================================
`;

const LINUX_ROUTE = `
default via 10.0.0.1 dev eth0 proto dhcp src 10.0.0.15 metric 100
10.0.0.0/24 dev eth0 proto kernel scope link src 10.0.0.15
`;

describe('parseGateway', () =>
{
    it('reads the gateway column out of the windows table', () =>
    {
        expect(parseGateway('win32', WINDOWS_ROUTE)).toBe('192.168.1.1');
    });

    it('reads the gateway out of the linux route list', () =>
    {
        expect(parseGateway('linux', LINUX_ROUTE)).toBe('10.0.0.1');
    });

    // A machine with both families has a default route in each.
    it('reads a gateway of the sixth version', () =>
    {
        const route = 'default via fe80::1 dev eth0 proto ra metric 1024';

        expect(parseGateway('linux', route)).toBe('fe80::1');
    });

    it('says nothing when there is no default route', () =>
    {
        expect(parseGateway('linux', '10.0.0.0/24 dev eth0 scope link')).toBeNull();
    });

    it('says nothing rather than guessing on unexpected output', () =>
    {
        expect(parseGateway('win32', 'Route table could not be read')).toBeNull();
    });
});

describe('reach', () =>
{
    // A machine that answers is the easy case, and the one the other two are read against.
    it('calls a listening port answered', async () =>
    {
        const server = createServer().listen(0, '127.0.0.1');
        await new Promise((done) => server.once('listening', done));

        const port = (server.address() as { port: number }).port;

        try
        {
            const result = await reach('127.0.0.1', port);

            expect(result.answer).toBe('answered');
            expect(result.latencyMs).toBeGreaterThanOrEqual(0);
        }
        finally
        {
            server.close();
        }
    });

    // The whole point of the module: a reset proves the machine is there. A router
    // that refuses port 80 is still a router that is alive.
    it('calls a refused port refused, not silent', async () =>
    {
        const result = await reach('127.0.0.1', 1);

        expect(result.answer).toBe('refused');
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

});

// The live tests above cannot produce a timeout on demand, so the reading of each
// error code is checked on its own.
describe('outcomeFor', () =>
{
    it('reads a reset as proof the machine is there', () =>
    {
        expect(outcomeFor('ECONNREFUSED')).toBe('refused');
        expect(outcomeFor('ECONNRESET')).toBe('refused');
    });

    it('leaves everything else unproven', () =>
    {
        expect(outcomeFor('EHOSTUNREACH')).toBe('silent');
        expect(outcomeFor('ENETUNREACH')).toBe('silent');
        expect(outcomeFor('ETIMEDOUT')).toBe('silent');
        expect(outcomeFor(undefined)).toBe('silent');
    });
});
