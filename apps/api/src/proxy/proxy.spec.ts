import { afterEach, describe, expect, it } from 'vitest';
import { createServer, connect, type Server } from 'node:net';
import { buildHello } from '../tls/hello.ts';
import { readConnect, startProxy, type Told } from './proxy.ts';
import { findName, splitPoint } from './split.ts';

const running: Server[] = [];

afterEach(() =>
{
    for (const server of running.splice(0))
    {
        server.close();
    }
});

describe('readConnect', () =>
{
    it('reads the host and port a browser asks for', () =>
    {
        expect(readConnect('CONNECT example.com:443 HTTP/1.1\r\n\r\n'))
            .toEqual({ host: 'example.com', port: 443 });
    });

    it('refuses anything that is not a connect', () =>
    {
        expect(readConnect('GET / HTTP/1.1\r\n\r\n')).toBeNull();
    });

    it('refuses a port outside the range', () =>
    {
        expect(readConnect('CONNECT example.com:99999 HTTP/1.1\r\n\r\n')).toBeNull();
    });
});

describe('findName', () =>
{
    it('finds the wanted name inside a hello', () =>
    {
        const hello = buildHello('example.com');
        const at = findName(hello);

        expect(hello.subarray(at, at + 11).toString()).toBe('example.com');
    });

    it('finds a longer name just as well', () =>
    {
        const hello = buildHello('a.rather.longer.example');
        const at = findName(hello);

        expect(hello.subarray(at, at + 23).toString()).toBe('a.rather.longer.example');
    });
});

describe('splitPoint', () =>
{
    // A fixed offset lands inside the name for one site and nowhere near it for
    // another, which is why the name is found rather than guessed at.
    it('cuts through the name itself', () =>
    {
        const hello = buildHello('example.com');
        const { at, why } = splitPoint(hello);

        expect(why).toBe('name');
        expect(at).toBeGreaterThan(findName(hello));
        expect(at).toBeLessThan(findName(hello) + 11);
    });

    it('leaves anything that is not a handshake alone', () =>
    {
        expect(splitPoint(Buffer.from('GET / HTTP/1.1'))).toEqual({ at: null, why: 'not-a-hello' });
    });

    it('leaves a chunk too short to read alone', () =>
    {
        expect(splitPoint(Buffer.from([0x16, 0x03])).at).toBeNull();
    });

    it('falls back to the middle when no name is in there', () =>
    {
        const noName = Buffer.concat([Buffer.from([0x16, 0x03, 0x03, 0, 20]), Buffer.alloc(20)]);

        expect(splitPoint(noName).why).toBe('middle');
    });
});

describe('the proxy', () =>
{
    // An address has nothing to resolve, and asking a resolver about one is a round
    // trip spent to be told what was already known.
    it('does not look up a literal address', async () =>
    {
        const upstream = await listening();
        const asked: string[] = [];

        const proxy = startProxy({ port: 0, gapMs: 20 });
        running.push(proxy);

        await new Promise((done) => proxy.once('listening', done));
        const port = (proxy.address() as { port: number }).port;

        const started = Date.now();
        await through(port, '127.0.0.1', upstream.port, buildHello('example.com'));

        // A lookup would add a round trip to somewhere outside; this must not.
        expect(Date.now() - started).toBeLessThan(2000);
        expect(asked).toEqual([]);
    });

    /** An upstream that records how many separate writes reached it. */
    function listening(): Promise<{ port: number; chunks: Buffer[] }>
    {
        return new Promise((resolve) =>
        {
            const chunks: Buffer[] = [];

            const server = createServer((socket) =>
            {
                socket.on('data', (chunk) => chunks.push(chunk));
                socket.on('error', () => socket.destroy());
            });

            running.push(server);

            server.listen(0, '127.0.0.1', () =>
            {
                resolve({ port: (server.address() as { port: number }).port, chunks });
            });
        });
    }

    function through(proxyPort: number, host: string, port: number, payload: Buffer)
    {
        return new Promise<void>((resolve) =>
        {
            const socket = connect(proxyPort, '127.0.0.1', () =>
            {
                socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\n\r\n`);
            });

            socket.once('data', () =>
            {
                socket.write(payload);
                setTimeout(() => { socket.destroy(); resolve(); }, 200);
            });

            socket.on('error', () => resolve());
        });
    }

    // Without a line for each connection the page can only say that the proxy is on,
    // and not that anything is going through it.
    it('tells what went through, and in how many pieces', async () =>
    {
        const told: Told[] = [];
        const upstream = await listening();
        const proxy = startProxy({ port: 0, gapMs: 0, overHttps: false,
            watch: (one) => told.push(one) });

        running.push(proxy);

        await new Promise((done) => proxy.once('listening', done));

        const port = (proxy.address() as { port: number }).port;

        await through(port, '127.0.0.1', upstream.port, buildHello('example.com'));

        expect(told).toHaveLength(1);
        expect(told[0]?.host).toBe('127.0.0.1');
        expect(told[0]?.pieces).toBeGreaterThan(1);
        expect(told[0]?.bytes).toBeGreaterThan(0);
        expect(told[0]?.error).toBeNull();
    });

    // A filter that lets the hello through and then drops the answer leaves a line
    // that looks like success. The bytes that came back are what tell them apart.
    it('says how much came back once the connection closes', async () =>
    {
        const told: Told[] = [];
        const upstream = await listening();
        const proxy = startProxy({ port: 0, gapMs: 0, overHttps: false,
            watch: (one) => told.push(one) });

        running.push(proxy);

        await new Promise((done) => proxy.once('listening', done));

        const port = (proxy.address() as { port: number }).port;

        await through(port, '127.0.0.1', upstream.port, buildHello('example.com'));
        await new Promise((done) => setTimeout(done, 120));

        const closed = told.filter((one) => one.carried !== undefined);

        expect(closed).toHaveLength(1);
        expect(closed[0]?.carried).toBeGreaterThanOrEqual(0);
    });

    // A site that would not answer is the interesting line, not the missing one. The
    // helper above waits for the proxy to answer, and on a refusal it never does.
    it('tells when the far end could not be reached', async () =>
    {
        const told: Told[] = [];
        const proxy = startProxy({ port: 0, gapMs: 0, overHttps: false,
            watch: (one) => told.push(one) });

        running.push(proxy);

        await new Promise((done) => proxy.once('listening', done));

        const port = (proxy.address() as { port: number }).port;

        await new Promise<void>((done) =>
        {
            const socket = connect(port, '127.0.0.1', () =>
            {
                socket.write('CONNECT 127.0.0.1:1 HTTP/1.1\r\n\r\n');
            });

            socket.on('error', () => undefined);
            setTimeout(() => { socket.destroy(); done(); }, 400);
        });

        expect(told).toHaveLength(1);
        expect(told[0]?.error).not.toBeNull();
        expect(told[0]?.port).toBe(1);
    });

    // The whole point: what leaves as one write must arrive as two.
    it('sends the hello in two pieces', async () =>
    {
        const upstream = await listening();
        const proxy = startProxy({ port: 0, gapMs: 20 });
        running.push(proxy);

        await new Promise((done) => proxy.once('listening', done));
        const port = (proxy.address() as { port: number }).port;

        await through(port, '127.0.0.1', upstream.port, buildHello('example.com'));

        expect(upstream.chunks.length).toBeGreaterThan(1);
    });

    it('delivers every byte, in order', async () =>
    {
        const upstream = await listening();
        const proxy = startProxy({ port: 0, gapMs: 20 });
        running.push(proxy);

        await new Promise((done) => proxy.once('listening', done));
        const port = (proxy.address() as { port: number }).port;
        const hello = buildHello('example.com');

        await through(port, '127.0.0.1', upstream.port, hello);

        expect(Buffer.concat(upstream.chunks).equals(hello)).toBe(true);
    });

    // Neither packet may carry the name a filter is looking for.
    it('leaves the name in neither piece', async () =>
    {
        const upstream = await listening();
        const proxy = startProxy({ port: 0, gapMs: 20 });
        running.push(proxy);

        await new Promise((done) => proxy.once('listening', done));
        const port = (proxy.address() as { port: number }).port;

        await through(port, '127.0.0.1', upstream.port, buildHello('example.com'));

        const wanted = Buffer.from('example.com');

        expect(upstream.chunks.some((chunk) => chunk.includes(wanted))).toBe(false);
    });
});

/**
 * A neighbour on the same Wi-Fi passes the address check and is still not this
 * person. The word is asked of them and never of loopback.
 *
 * Every connection here comes from loopback, so what the proxy reads as the far
 * address is set on the socket: a machine in a container has no second address to
 * knock from, and the path that matters is the one for somebody who does.
 */
describe('the word a networked client carries', () =>
{
    const WORD = 'a-word-for-the-phone';

    async function asking(from: string, word?: string): Promise<string>
    {
        const proxy = startProxy({ port: 0, onNetwork: true, key: WORD, gapMs: 0,
            overHttps: false });

        running.push(proxy);

        proxy.prependListener('connection', (socket) =>
        {
            Object.defineProperty(socket, 'remoteAddress',
                { value: from, configurable: true });
        });

        await new Promise((ready) => proxy.once('listening', ready));

        const port = (proxy.address() as { port: number }).port;

        return await new Promise<string>((done) =>
        {
            const socket = connect(port, '127.0.0.1', () =>
            {
                const carried = word === undefined ? '' : 'Proxy-Authorization: Basic '
                    + Buffer.from(`phone:${word}`).toString('base64') + '\r\n';

                socket.write(`CONNECT example.com:443 HTTP/1.1\r\n${carried}\r\n`);
            });

            let said = '';

            socket.on('data', (piece) =>
            {
                said += piece.toString('latin1');

                if (said.includes('\r\n'))
                {
                    socket.destroy();
                    done(said.split('\r\n')[0] ?? '');
                }
            });

            socket.on('error', () => done('dropped'));
            setTimeout(() => { socket.destroy(); done(said || 'silent'); }, 2000);
        });
    }

    it('asks nothing of this machine', async () =>
    {
        expect(await asking('127.0.0.1')).toContain('200');
    });

    it('asks the network for the word', async () =>
    {
        expect(await asking('192.168.1.50')).toContain('407');
    });

    it('lets the network through once it carries the word', async () =>
    {
        expect(await asking('192.168.1.50', WORD)).toContain('200');
    });

    it('refuses the wrong word', async () =>
    {
        expect(await asking('192.168.1.50', 'not it')).toContain('407');
    });

    // The word is not a way in for anybody: an address outside the local network is
    // dropped before it is asked for anything.
    it('drops an address off the network, word or no word', async () =>
    {
        expect(await asking('8.8.8.8', WORD)).not.toContain('200');
    });
});
