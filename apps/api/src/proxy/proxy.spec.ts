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
