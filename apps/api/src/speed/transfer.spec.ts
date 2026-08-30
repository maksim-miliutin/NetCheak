import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { CLOUDFLARE, measureSpeed, type Source } from './transfer.ts';

/**
 * A server of our own rather than the internet. The maths beside this is tested on
 * numbers; what was never tested is the transfer itself, and that is where the bug
 * was: one request per stream emptied its budget in under a second and left nothing
 * to measure once the warmup was dropped.
 */

const running: Server[] = [];

interface Standing
{
    source: Source;
    requests: () => number;
}

function serving(rateBytesPerTick = 4_000_000): Promise<Standing>
{
    return new Promise((resolve) =>
    {
        let requests = 0;

        const server = createServer((request, response) =>
        {
            requests += 1;

            if (request.method === 'POST')
            {
                request.on('data', () => undefined);
                request.on('end', () => response.end('ok'));

                return;
            }

            const asked = Number(new URL(request.url ?? '', 'http://x').searchParams
                .get('bytes') ?? 0);

            response.writeHead(200, { 'content-type': 'application/octet-stream' });

            let sent = 0;

            // Fed in slices rather than at once, so the timings mean something.
            const feed = setInterval(() =>
            {
                if (sent >= asked)
                {
                    clearInterval(feed);
                    response.end();

                    return;
                }

                const slice = Math.min(rateBytesPerTick, asked - sent);

                sent += slice;
                response.write(Buffer.alloc(slice));
            }, 10);
        });

        running.push(server);

        server.listen(0, '127.0.0.1', () =>
        {
            const { port } = server.address() as { port: number };

            resolve({
                source:
                {
                    name: 'test',
                    download: (bytes) => `http://127.0.0.1:${port}/down?bytes=${bytes}`,
                    upload: `http://127.0.0.1:${port}/up`,
                },
                requests: () => requests,
            });
        });
    });
}

afterEach(() =>
{
    for (const server of running.splice(0))
    {
        server.close();
    }
});

describe('the source', () =>
{
    it('asks the far end for the number of bytes it wants', () =>
    {
        expect(CLOUDFLARE.download(1234)).toContain('bytes=1234');
    });

    it('has somewhere to push to as well as pull from', () =>
    {
        expect(CLOUDFLARE.upload).toBeTruthy();
    });
});

describe('measureSpeed', () =>
{
    it('reports a rate and what it measured against', async () =>
    {
        const { source } = await serving();

        // The first request of a run pays for the client waking up, and on a busy
        // machine that alone outlasts a window this short: every stream is aborted
        // before a byte lands and the reading comes back empty for a reason that has
        // nothing to do with the transfer.
        const woken = await fetch(source.download(1));

        await woken.text();

        const measured = await measureSpeed(source,
            { durationMs: 400, warmupMs: 50, streams: 2 });

        expect(measured.source).toBe('test');
        expect(measured.download?.streams).toBe(2);
        expect(measured.download?.megabits ?? 0).toBeGreaterThan(0);
    }, 15_000);

    /**
     * The bug: one request per stream emptied its budget and the run ended early,
     * leaving a window shorter than the warmup and nothing to measure. Served fast
     * enough that a portion is gone well before the clock is, so a single request
     * per stream would show up as a count of two.
     */
    it('keeps asking until the clock runs out', async () =>
    {
        const { source, requests } = await serving(20_000_000);

        await measureSpeed(source, { durationMs: 600, warmupMs: 50, streams: 1 });

        expect(requests()).toBeGreaterThan(3);
    }, 15_000);

    it('opens as many streams as it was asked for', async () =>
    {
        const { source } = await serving();
        const measured = await measureSpeed(source,
            { durationMs: 300, warmupMs: 50, streams: 3 });

        expect(measured.download?.streams).toBe(3);
    }, 15_000);

    // A far end that answers nothing is the ordinary case when the line is down, and
    // it must come back as no reading rather than as a crash.
    it('survives a far end that refuses', async () =>
    {
        const refusing: Source =
        {
            name: 'refusing',
            download: () => 'http://127.0.0.1:1/down',
            upload: 'http://127.0.0.1:1/up',
        };

        const measured = await measureSpeed(refusing,
            { durationMs: 300, warmupMs: 50, streams: 1 });

        expect(measured.download).toBeNull();
        expect(measured.upload).toBeNull();
    }, 15_000);

    it('measures nothing to push when there is nowhere to push to', async () =>
    {
        const { source } = await serving();
        const measured = await measureSpeed({ ...source, upload: null },
            { durationMs: 300, warmupMs: 50, streams: 1 });

        expect(measured.upload).toBeNull();
        expect(measured.download?.megabits ?? 0).toBeGreaterThan(0);
    }, 15_000);
});
