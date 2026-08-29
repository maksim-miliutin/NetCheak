import { createServer, connect, type Socket, type Server } from 'node:net';
import { writeAs, type Way } from './ways.ts';

export interface ProxyOptions
{
    port?: number;
    /** How long to hold each piece back, so they arrive apart. */
    gapMs?: number;
    /** Which way to write the first record; the rest are relayed untouched. */
    way?: Way;
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

            open(client, asked.host, asked.port, gapMs, way);
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

function open(client: Socket, host: string, port: number, gapMs: number, way: Way): void
{
    const upstream = connect(port, host, () =>
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
