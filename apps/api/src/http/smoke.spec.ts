import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../db/database.ts';
import { ChecksRepository } from '../db/checks.repository.ts';
import { buildServer } from './server.ts';
import { choosePort } from './port.ts';

/**
 * The layer nothing else covers: a real server on a real port, asked over a real
 * socket. Every route was reachable in the tests below it and the whole still broke —
 * a report that never learned about two checks, a headline with nothing to show, a
 * page gone blank on an answer that arrived short. Those were found by hand, and a
 * thing found by hand twice belongs in the suite.
 */

const FILE = join(tmpdir(), `netcheck-smoke-${process.pid}.db`);

let base = '';
let app: Awaited<ReturnType<typeof buildServer>>;
let db: Database;

async function ask(path: string, init?: RequestInit): Promise<Response>
{
    return await fetch(`${base}${path}`, init);
}

/** What came back, as something with fields rather than as unknown. */
async function body<T>(response: Response): Promise<T>
{
    return await response.json() as T;
}

beforeAll(async () =>
{
    for (const suffix of ['', '-wal', '-shm'])
    {
        rmSync(`${FILE}${suffix}`, { force: true });
    }

    db = new Database(FILE);

    await db.migrate(join(import.meta.dirname, '..', '..', 'migrations'));

    const { port } = await choosePort(18500);

    app = await buildServer({ db, repository: new ChecksRepository(db), port,
        logLevel: 'silent' });

    await app.listen({ port, host: '127.0.0.1' });

    base = `http://127.0.0.1:${port}`;
}, 30_000);

afterAll(async () =>
{
    await app.close();

    // Windows refuses to delete a file anything still holds open, and the server
    // does not close the database for us: it is handed one and does not own it.
    db.close();

    for (const suffix of ['', '-wal', '-shm'])
    {
        rmSync(`${FILE}${suffix}`, { force: true });
    }
});

describe('a server on a real port', () =>
{
    it('answers that it is alive', async () =>
    {
        const response = await ask('/api/health');

        expect(response.status).toBe(200);
        expect((await body<{ status: string }>(response)).status).toBeTruthy();
    });

    // Reading the page must not wait on anything: it once waited a second and a half
    // for a gateway probe on every load.
    it.each(['/api/status', '/api/history', '/api/targets', '/api/tunnels', '/api/outbound'])(
        'answers %s without asking the network', async (path) =>
        {
            const at = Date.now();
            const response = await ask(path);

            expect(response.status).toBe(200);
            expect(Date.now() - at).toBeLessThan(1000);
        });

    it('hands back a report as text', async () =>
    {
        const response = await ask('/api/report');

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/plain');
        expect(await response.text()).toContain('netcheck');
    });

    // Anything but this machine is refused before the route is reached, because a
    // request with a plain content type never triggers a preflight.
    it('refuses a request from somewhere else', async () =>
    {
        const response = await ask('/api/status', { headers: { origin: 'http://evil.test' } });

        expect(response.status).toBe(403);
    });

    it('takes a target, watches it, and gives it back', async () =>
    {
        const added = await ask('/api/targets',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ target: 'https://smoke.example:8443/x' }),
        });

        expect(added.status).toBe(200);

        type Added = { target: { id: number; host: string; port: number } };

        const { target } = await body<Added>(added);

        expect(target).toMatchObject({ host: 'smoke.example', port: 8443 });

        const listed = await body<{ targets: { host: string }[] }>(await ask('/api/targets'));

        expect(listed.targets.some((one) => one.host === 'smoke.example')).toBe(true);

        const removed = await ask(`/api/targets/${target.id}`, { method: 'DELETE' });

        expect(removed.status).toBe(204);
    });

    it('says why it refused a target rather than only that it did', async () =>
    {
        const response = await ask('/api/targets',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ target: 'not a host' }),
        });

        expect(response.status).toBe(400);
        const refused = await body<{ error: { message: string } }>(response);

        expect(refused.error.message.length).toBeGreaterThan(10);
    });

    // The proxies are the largest thing this does to a machine, so starting and
    // stopping them has to work from the outside, not only in a mock.
    it('starts every proxy and stops them again', async () =>
    {
        type Relays = { running: boolean; relays: { port: number }[] };

        const started = await body<Relays>(await ask('/api/proxy', { method: 'POST' }));

        expect(started.running).toBe(true);
        expect(started.relays.length).toBeGreaterThan(1);

        const ports = started.relays.map((one) => one.port);

        expect(new Set(ports).size).toBe(ports.length);

        const stopped = await body<Relays>(await ask('/api/proxy', { method: 'POST' }));

        expect(stopped.running).toBe(false);
        expect(stopped.relays).toEqual([]);
    }, 20_000);

    it('hands back a routing file a browser could read', async () =>
    {
        const response = await ask('/api/proxy.pac');

        expect(response.status).toBe(200);
        expect(await response.text()).toContain('FindProxyForURL');
    });

    it('answers a route nobody has in the same shape as any other error', async () =>
    {
        const response = await ask('/api/nothing-here');

        expect(response.status).toBe(404);
        expect((await body<{ error: unknown }>(response)).error).toBeTruthy();
    });

    it('keeps a host routed by hand and hands it back', async () =>
    {
        const added = await ask('/api/proxy/routes',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ host: 'Blocked.Example', way: 'name' }),
        });

        expect(added.status).toBe(200);

        const state = await body<{ routed: { host: string; byHand: boolean }[] }>(added);

        expect(state.routed).toContainEqual(
            { host: 'blocked.example', way: 'name', byHand: true });

        const gone = await ask('/api/proxy/routes/blocked.example', { method: 'DELETE' });

        expect(gone.status).toBe(200);
        expect((await body<{ routed: unknown[] }>(gone)).routed).toEqual([]);
    });

    it('refuses a host that is not one, and says which part it refused', async () =>
    {
        const response = await ask('/api/proxy/routes',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ host: 'not a host', way: 'name' }),
        });

        expect(response.status).toBe(400);
        expect((await body<{ error: string }>(response)).error).toContain('host');
    });

    it('refuses a way of writing it does not have', async () =>
    {
        const response = await ask('/api/proxy/routes',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ host: 'example.com', way: 'origami' }),
        });

        expect(response.status).toBe(400);
        expect((await body<{ error: string }>(response)).error).toContain('way');
    });

    it('says the driver is not running until it is asked to run', async () =>
    {
        const state = await body<{ running: boolean; lines: unknown[] }>(
            await ask('/api/divert'));

        expect(state.running).toBe(false);
        expect(state.lines).toEqual([]);
    });

    it('refuses a way of spoiling a copy that it does not have', async () =>
    {
        const response = await ask('/api/divert',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ running: true, fooling: 'origami' }),
        });

        expect(response.status).toBe(400);
        expect((await body<{ error: { message: string } }>(response)).error.message)
            .toContain('origami');
    });

    it('refuses a count of hops that is not one', async () =>
    {
        const response = await ask('/api/divert',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ running: true, ttl: 900 }),
        });

        expect(response.status).toBe(400);
        expect((await body<{ error: { message: string } }>(response)).error.message)
            .toMatch(/hops/i);
    });

    it('refuses a recording that is not there', async () =>
    {
        const response = await ask('/api/divert',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ running: true, hello: 'nothing-recorded-here.bin' }),
        });

        expect(response.status).toBe(400);
        expect((await body<{ error: { message: string } }>(response)).error.message)
            .toContain('recorded');
    });

    it('stops without minding that nothing was running', async () =>
    {
        const response = await ask('/api/divert',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ running: false }),
        });

        expect(response.status).toBe(200);
        expect((await body<{ running: boolean }>(response)).running).toBe(false);
    });

    it('says nothing has been found for any site yet', async () =>
    {
        const found = await body<{ found: unknown[] }>(await ask('/api/divert/found'));

        expect(found.found).toEqual([]);
    });

    it('refuses a search for something that is not a host', async () =>
    {
        const response = await ask('/api/divert/search',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ target: 'not a host at all' }),
        });

        expect(response.status).toBe(400);
        expect((await body<{ error: { message: string } }>(response)).error.message)
            .toBeTruthy();
    });
});

/**
 * Closing has hung twice now: once on a database nobody closed, once on connections a
 * client was still holding. Both times it looked like the suite freezing rather than
 * like a bug, and both times it was a bug.
 */
describe('closing', () =>
{
    it('lets go of a connection somebody else is still holding', async () =>
    {
        const file = join(tmpdir(), `netcheck-closing-${process.pid}.db`);
        const db = new Database(file);

        await db.migrate(join(import.meta.dirname, '..', '..', 'migrations'));

        const { port } = await choosePort(18700);
        const second = await buildServer({ db, repository: new ChecksRepository(db),
            port, logLevel: 'silent' });

        await second.listen({ port, host: '127.0.0.1' });

        // Asked for and left unread, which is what a browser tab does all day.
        await fetch(`http://127.0.0.1:${port}/api/status`);

        const started = Date.now();

        await second.close();
        db.close();

        for (const suffix of ['', '-wal', '-shm'])
        {
            rmSync(`${file}${suffix}`, { force: true });
        }

        expect(Date.now() - started).toBeLessThan(5000);
    }, 20_000);
});

describe('helping more than the site that was searched for', () =>
{
    async function copy(host: string): Promise<Response>
    {
        return await ask('/api/divert/found',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ host }),
        });
    }

    it('refuses to copy settings before anything has been found', async () =>
    {
        const answer = await copy('youtube.com');

        expect(answer.status).toBe(400);
        expect(await answer.text()).toContain('Search for one first');
    });

    // A filter is one thing: a setting that gets past it for one site gets past it
    // for the next. Searching again would spend a minute to arrive at the answer
    // already in hand.
    it('copies what worked for one site onto another', async () =>
    {
        new ChecksRepository(db).rememberDriver(
            { host: 'discord.com', fooling: 'ttl', ttl: 6, repeats: 6 });

        const answer = await copy('youtube.com');

        expect(answer.status).toBe(200);

        const { found } = await body<{ found: { host: string; ttl: number }[] }>(answer);

        expect(found.find((one) => one.host === 'youtube.com')?.ttl).toBe(6);
    });

    it('refuses a host that is not one', async () =>
    {
        expect((await copy('not a host at all')).status).toBe(400);
    });

    it('lets a site go again', async () =>
    {
        new ChecksRepository(db).rememberDriver(
            { host: 'gone.example', fooling: 'ttl', ttl: 6, repeats: 6 });

        const answer = await ask('/api/divert/found/gone.example', { method: 'DELETE' });

        expect(answer.status).toBe(200);
        expect(await answer.text()).not.toContain('gone.example');
    });
});

describe('finding the set that gets a site through', () =>
{
    async function search(host: string): Promise<Response>
    {
        return await ask('/api/proxy/search',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ host }),
        });
    }

    it('refuses a host that is not one', async () =>
    {
        expect((await search('not a host at all')).status).toBe(400);
    });

    /**
     * The route walks out to the site eight times, once per way of writing a hello.
     * How long that takes is the network's business: here it answered at once, on a
     * machine where the address is dropped rather than refused it took longer than
     * the whole suite is allowed.
     *
     * So what is checked is the shape of the answer and not the walk: that the route
     * exists, refuses what is not a host, and hands back something the page can read
     * without guessing. The walking itself is checked where it lives, against a
     * server this test starts.
     */
    it('answers a site it cannot reach without hanging on it', async () =>
    {
        const answer = await search('127.0.0.1');

        expect(answer.status).toBe(200);

        const said = await body<{ host: string; preset: string | null;
            started: boolean }>(answer);

        expect(said.host).toBe('127.0.0.1');
        expect(typeof said.started).toBe('boolean');
    }, 20000);
});
