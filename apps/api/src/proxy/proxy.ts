import { createServer, connect, type Socket, type Server } from 'node:net';
import { writeAs, type Way } from './ways.ts';
import { isLoopback, mayRelay } from '../access/allowed.ts';
import { carriesKey } from '../access/secret.ts';
import { resolveOverHttps } from '../dns/doh.ts';
import { isAddress } from '../targets/address.ts';

/**
 * What went through, told as it happens. Held in memory and never written down: a
 * list of the sites somebody opened is the one thing this tool promises not to keep.
 */
export interface Told
{
    host: string;
    port: number;
    way: Way;
    /** How many pieces the opening record went out in. */
    pieces: number;
    bytes: number;
    error: string | null;

    /**
     * How much came back once the connection closed, or nothing while it is still
     * open. The size of the hello says a connection was made; this says whether
     * anything came of it, which is the difference between a site that answered and
     * one that took the greeting and went quiet.
     */
    carried?: number;
}

export interface ProxyOptions
{
    port?: number;
    /** How long to hold each piece back, so they arrive apart. */
    gapMs?: number;
    /** Which way to write the first record; the rest are relayed untouched. */
    way?: Way;
    /** Resolve names over HTTPS, so a hijacked plain answer cannot reach them. */
    overHttps?: boolean;
    /**
     * Listen where the rest of the network can reach it, for a phone. Everybody on
     * that network can then route through it, which is why it is off by default and
     * asked for by name.
     */
    onNetwork?: boolean;

    /** The word a networked client must carry; nothing when only loopback is served. */
    key?: string;

    /** Told what passed through, so the page can show it going. */
    watch?: (told: Told) => void;
}

const DEFAULT_PORT = 3128;

const DEFAULT_GAP_MS = 40;

/**
 * A proxy the browser is pointed at. On CONNECT it opens a plain connection onward
 * and relays bytes without looking at them: the traffic stays encrypted end to end,
 * and this never holds a key to any of it. The only thing it does is cut the first
 * write in two.
 */
export function startProxy(options: ProxyOptions = {}): Server
{
    const gapMs = options.gapMs ?? DEFAULT_GAP_MS;
    const way = options.way ?? 'name';
    const overHttps = options.overHttps ?? true;

    const onNetwork = options.onNetwork === true;

    const server = createServer((client) =>
    {
        // Asked per connection rather than answered once by choosing an address to
        // listen on. Every interface on a machine with a public address is an open
        // proxy facing the internet, which is not what a phone on the sofa needs.
        if (!mayRelay(client.remoteAddress, onNetwork))
        {
            client.destroy();

            return;
        }

        const fromNetwork = !isLoopback(client.remoteAddress);

        client.once('data', (chunk) =>
        {
            const asked = readConnect(chunk.toString('latin1'));

            if (asked === null)
            {
                client.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n');

                return;
            }

            // A neighbour on the same Wi-Fi passes the address check and is still not
            // this person. The word is asked of them and never of loopback, where a
            // program is already trusted.
            if (fromNetwork && options.key !== undefined
                && !carriesKey(proxyAuth(chunk.toString('latin1')), options.key))
            {
                client.end('HTTP/1.1 407 Proxy Authentication Required\r\n'
                    + 'Proxy-Authenticate: Basic realm="netcheck"\r\n\r\n');

                return;
            }

            void open(client, asked.host, asked.port, gapMs, way, overHttps,
                options.watch);
        });

        client.on('error', () => client.destroy());
    });

    server.listen(options.port ?? DEFAULT_PORT, onNetwork ? '0.0.0.0' : '127.0.0.1');

    return server;
}

/** The proxy password out of the request head, or nothing when none was sent. */
export function proxyAuth(head: string): string | undefined
{
    const line = /proxy-authorization:\s*(.+)/i.exec(head);

    return line === null ? undefined : line[1].trim();
}

export function readConnect(head: string): { host: string; port: number } | null
{
    const line = /^CONNECT ([^\s:]+):(\d+) HTTP\/1\.[01]/.exec(head);

    if (line === null)
    {
        return null;
    }

    const port = Number(line[2]);

    return Number.isInteger(port) && port > 0 && port < 65536
        ? { host: line[1] ?? '', port }
        : null;
}

async function open(
    client: Socket,
    host: string,
    port: number,
    gapMs: number,
    way: Way,
    overHttps: boolean,
    watch?: (told: Told) => void,
): Promise<void>
{
    // Splitting the write gets past a filter reading the name. It does nothing about
    // a resolver answering with an address of somebody else's choosing, and asking
    // over HTTPS is what does: the question travels inside a connection nobody
    // standing beside it can answer.
    const where = overHttps && !isAddress(host) ? await addressFor(host) : host;

    const upstream = connect(port, where, () =>
    {
        client.write('HTTP/1.1 200 Connection established\r\n\r\n');

        let first = true;

        client.on('data', (chunk) =>
        {
            if (!first)
            {
                upstream.write(chunk);

                return;
            }

            first = false;

            // Only the opening record is written differently; everything after it is
            // relayed as it comes.
            const { pieces } = writeAs(way, chunk);

            watch?.({ host, port, way, pieces: pieces.length, bytes: chunk.length,
                error: null });

            pieces.forEach((piece, index) =>
            {
                if (index === 0)
                {
                    upstream.write(piece);

                    return;
                }

                setTimeout(() => upstream.write(piece), gapMs * index);
            });
        });

        // Counted rather than guessed: a filter that lets the hello through and then
        // drops the answer leaves a line that looks like success, and the number of
        // bytes that came back is what tells them apart.
        let carried = 0;

        upstream.on('data', (piece: Buffer) => { carried += piece.length; });

        client.once('close', () =>
        {
            watch?.({ host, port, way, pieces: 0, bytes: 0, error: null, carried });
        });

        upstream.pipe(client);
    });

    const drop = (): void =>
    {
        client.destroy();
        upstream.destroy();
    };

    upstream.on('error', (err: Error) =>
    {
        watch?.({ host, port, way, pieces: 0, bytes: 0, error: err.message });
        drop();
    });
    client.on('error', drop);
    client.on('close', () => upstream.destroy());
}

/** The name itself when the lookup gives nothing: a worse road beats no road. */
async function addressFor(host: string): Promise<string>
{
    try
    {
        const found = await resolveOverHttps(host);

        return found.addresses[0] ?? host;
    }
    catch (err)
    {
        return host;
    }
}
