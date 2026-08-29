import { createServer, connect, type Socket, type Server } from 'node:net';
import { writeAs, type Way } from './ways.ts';
import { resolveOverHttps } from '../dns/doh.ts';
import { isAddress } from '../targets/address.ts';

export interface ProxyOptions
{
    port?: number;
    /** How long to hold each piece back, so they arrive apart. */
    gapMs?: number;
    /** Which way to write the first record; the rest are relayed untouched. */
    way?: Way;
    /** Resolve names over HTTPS, so a hijacked plain answer cannot reach them. */
    overHttps?: boolean;
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

    const server = createServer((client) =>
    {
        client.once('data', (chunk) =>
        {
            const asked = readConnect(chunk.toString('latin1'));

            if (asked === null)
            {
                client.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n');

                return;
            }

            void open(client, asked.host, asked.port, gapMs, way, overHttps);
        });

        client.on('error', () => client.destroy());
    });

    server.listen(options.port ?? DEFAULT_PORT, '127.0.0.1');

    return server;
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

        upstream.pipe(client);
    });

    const drop = (): void =>
    {
        client.destroy();
        upstream.destroy();
    };

    upstream.on('error', drop);
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
