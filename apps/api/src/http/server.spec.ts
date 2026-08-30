import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Database } from '../db/database.ts';
import { ChecksRepository } from '../db/checks.repository.ts';
import { buildServer } from './server.ts';

const migrations = join(__dirname, '..', '..', 'migrations');

describe('HTTP API', () =>
{
    let db: Database;
    let app: FastifyInstance;

    beforeEach(async () =>
    {
        db = new Database(':memory:');
        await db.migrate(migrations);

        app = await buildServer({ db, repository: new ChecksRepository(db), logLevel: 'silent' });
    });

    afterEach(async () =>
    {
        await app.close();
        db.close();
    });

    it('reports health with database latency', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/health' });

        expect(response.statusCode).toBe(200);
        expect(response.json().status).toBe('ok');
        expect(response.json().database.reachable).toBe(true);
    });

    it('lists the seeded targets', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/targets' });

        expect(response.statusCode).toBe(200);
        expect(response.json().targets).toHaveLength(4);
    });

    it('returns every target before the first check', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/status' });
        const targets = response.json().targets;

        expect(targets).toHaveLength(4);
        expect(targets.every((t: { quality: string | null }) => t.quality === null)).toBe(true);
    });

    it('carries the last speed run beside the status, or nothing yet', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/status' });

        expect(response.json().speed).toBeNull();
    });

    // Reading the page waited a second and a half for the gateway probe. The nearest
    // hop belongs to running a check, not to reading what a check found.
    it('knows nothing of the nearest hop until a check has run', async () =>
    {
        const before = await app.inject({ method: 'GET', url: '/api/status' });

        expect(before.json().rings).toBeNull();

        await app.inject(
        {
            method: 'POST',
            url: '/api/checks',
            payload: { attempts: 1, timeoutMs: 300 },
        });

        const after = await app.inject({ method: 'GET', url: '/api/status' });

        expect(after.json().rings).not.toBeNull();
    });

    it('answers status with a verdict beside the rows', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/status' });

        expect(response.json().verdict).toMatchObject({ level: 'unknown', cause: 'never-checked' });
    });

    it('carries a request id in both the header and the body', async () =>
    {
        const response = await app.inject(
        {
            method: 'POST',
            url: '/api/checks',
            payload: { attempts: 0 },
        });

        expect(response.statusCode).toBe(400);
        expect(response.headers['x-request-id']).toBe(response.json().error.requestId);
    });

    it.each(
    [
        ['attempts below the minimum', { attempts: 0 }],
        ['attempts above the maximum', { attempts: 51 }],
        ['attempts that are not whole', { attempts: 2.5 }],
        ['timeout below the minimum', { timeoutMs: 50 }],
        ['timeout above the maximum', { timeoutMs: 60000 }],
    ])('rejects %s', async (_label, payload) =>
    {
        const response = await app.inject({ method: 'POST', url: '/api/checks', payload });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.message).toBeTruthy();
    });

    // Port 1 on loopback refuses instantly, which is a reachable host with nothing
    // listening: the check has to come back as a total loss rather than as an error.
    it('runs a check against a local port and stores the result', async () =>
    {
        db.exec('UPDATE targets SET enabled = 0');
        db.prepare('INSERT INTO targets (name, host, port) VALUES (?, ?, ?)')
            .run('local', '127.0.0.1', 1);

        const response = await app.inject(
        {
            method: 'POST',
            url: '/api/checks',
            payload: { attempts: 2, timeoutMs: 500 },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().checkId).toBeGreaterThan(0);

        const status = await app.inject({ method: 'GET', url: '/api/status' });
        const local = status.json().targets.find((t: { name: string }) => t.name === 'local');

        expect(local.quality).toBe('unusable');
        expect(local.lossPercent).toBe(100);
    });

    // A page the user has open must not be able to spend their traffic or point this
    // machine at hosts of its choosing.
    it('refuses a request carrying somebody else\'s origin', async () =>
    {
        const response = await app.inject(
        {
            method: 'POST',
            url: '/api/speed',
            headers: { origin: 'https://evil.example' },
        });

        expect(response.statusCode).toBe(403);
    });

    it('lets its own interface through', async () =>
    {
        const response = await app.inject(
        {
            method: 'GET',
            url: '/api/status',
            headers: { origin: 'http://127.0.0.1:5173' },
        });

        expect(response.statusCode).toBe(200);
    });

    it('lets a request with no origin through, as a terminal client has none', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/status' });

        expect(response.statusCode).toBe(200);
    });

    it('answers the dns check with a comparison of two resolvers', async () =>
    {
        const response = await app.inject({ method: 'POST', url: '/api/dns' });

        expect(response.statusCode).toBe(200);
        expect(response.json().name).toBeTruthy();
        expect(response.json().reference.server).toBe('1.1.1.1');
    });

    // Raw addresses have no name to present, so a certificate check on them would
    // always look like a mismatch.
    it('checks certificates only for targets that have a name', async () =>
    {
        db.exec('UPDATE targets SET enabled = 0');
        db.prepare('INSERT INTO targets (name, host, port) VALUES (?, ?, ?)')
            .run('numeric', '198.51.100.7', 443);

        const response = await app.inject({ method: 'POST', url: '/api/tls' });

        expect(response.statusCode).toBe(200);
        expect(response.json().checks).toEqual([]);
    });

    it('takes an address a person pasted and watches it', async () =>
    {
        const response = await app.inject(
        {
            method: 'POST',
            url: '/api/targets',
            payload: { target: 'https://my.example/news' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().target).toMatchObject({ host: 'my.example', port: 443 });
    });

    it.each(
    [
        ['nothing at all', ''],
        ['a word with no dot', 'router'],
        ['an impossible port', 'my.example:70000'],
    ])('refuses %s and says why', async (_label, target) =>
    {
        const url = '/api/targets';
        const response = await app.inject({ method: 'POST', url, payload: { target } });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.message).toBeTruthy();
    });

    it('retires a target', async () =>
    {
        const added = await app.inject(
        {
            method: 'POST',
            url: '/api/targets',
            payload: { target: 'my.example' },
        });

        const id = added.json().target.id;
        const removed = await app.inject({ method: 'DELETE', url: `/api/targets/${id}` });

        expect(removed.statusCode).toBe(204);
    });

    it('answers 404 for a target that is not there', async () =>
    {
        const response = await app.inject({ method: 'DELETE', url: '/api/targets/9999' });

        expect(response.statusCode).toBe(404);
    });

    it('answers with the runs it has kept', async () =>
    {
        await app.inject(
        {
            method: 'POST',
            url: '/api/checks',
            payload: { attempts: 1, timeoutMs: 300 },
        });

        const response = await app.inject({ method: 'GET', url: '/api/history' });

        expect(response.statusCode).toBe(200);
        expect(response.json().targets[0].runs).toHaveLength(1);
    });

    it('refuses to trace something that is not a host', async () =>
    {
        const response = await app.inject(
        {
            method: 'POST',
            url: '/api/trace',
            payload: { target: 'not a host' },
        });

        expect(response.statusCode).toBe(400);
    });

    it('hands back a report as plain text', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/report' });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('text/plain');
        expect(response.body).toContain('netcheck report');
    });

    // Repeating the checks to write the report would describe a different minute than
    // the one it claims to.
    it('writes the report from what the checks already found', async () =>
    {
        await app.inject({ method: 'POST', url: '/api/dns' });

        const response = await app.inject({ method: 'GET', url: '/api/report' });

        expect(response.body).toContain('Name lookup');
    });

    it('refuses to measure something that is not a host', async () =>
    {
        const response = await app.inject(
        {
            method: 'POST',
            url: '/api/mtu',
            payload: { target: 'not a host' },
        });

        expect(response.statusCode).toBe(400);
    });

    // The list of what leaves this machine must not claim an errand the tool has not
    // been asked to run.
    it('keeps the version check out of the outbound list until it is asked for', async () =>
    {
        // github.com is a watched target from the start, so the ask is about the
        // address the version question goes to, not about the word.
        const asked = (body: { errands: { where: string }[] }): boolean =>
            body.errands.some((errand) => errand.where === 'api.github.com');

        const before = await app.inject({ method: 'GET', url: '/api/outbound' });

        expect(asked(before.json())).toBe(false);

        await app.inject({ method: 'POST', url: '/api/update' });

        const after = await app.inject({ method: 'GET', url: '/api/outbound' });

        expect(asked(after.json())).toBe(true);
    });

    // A thing standing between the browser and the network is not switched on behind
    // somebody's back, so it starts off and the same button stops it.
    it('starts with no proxy running', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/proxy' });

        expect(response.json()).toMatchObject({ running: false, relays: [] });
        expect(response.json().ways.length).toBeGreaterThan(1);
    });

    it('starts and stops the proxy on the same ask', async () =>
    {
        const started = await app.inject({ method: 'POST', url: '/api/proxy' });

        expect(started.json().running).toBe(true);

        // One per way, each on its own port: different sites are stopped by different
        // filters and a single way serves one of them and fails the rest.
        expect(started.json().relays).toHaveLength(started.json().ways.length);
        expect(new Set(started.json().relays.map((r: { port: number }) => r.port)).size)
            .toBe(started.json().relays.length);

        const stopped = await app.inject({ method: 'POST', url: '/api/proxy' });

        expect(stopped.json().running).toBe(false);
    });

    // Zapret ships thirteen files called ALT and leaves a person to try them; naming
    // one starts only that one.
    it('starts only the proxy a named preset asks for', async () =>
    {
        const started = await app.inject(
        {
            method: 'POST',
            url: '/api/proxy',
            payload: { preset: 'records-1' },
        });

        expect(started.json().relays).toHaveLength(1);
        expect(started.json().relays[0].way).toBe('records');
        expect(started.json().preset).toBe('records-1');

        await app.inject({ method: 'POST', url: '/api/proxy' });
    });

    it('offers the presets cheapest first', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/proxy' });

        expect(response.json().presets[0].id).toBe('lite-1');
    });

    // Everybody on that network can route through it once it listens there, so it
    // stays on this machine unless asked otherwise.
    it('listens only on this machine unless asked otherwise', async () =>
    {
        const started = await app.inject({ method: 'POST', url: '/api/proxy' });

        expect(started.json().onNetwork).toBe(false);
        expect(started.json().lan).toBeNull();

        await app.inject({ method: 'POST', url: '/api/proxy' });
    });

    it('says where a phone would reach it once asked', async () =>
    {
        const started = await app.inject(
        {
            method: 'POST',
            url: '/api/proxy',
            payload: { preset: 'lite-1', onNetwork: true },
        });

        expect(started.json().onNetwork).toBe(true);

        await app.inject({ method: 'POST', url: '/api/proxy' });
    });

    it('runs one proxy for every way it knows', async () =>
    {
        const started = await app.inject({ method: 'POST', url: '/api/proxy' });
        const ways = started.json().relays.map((relay: { way: string }) => relay.way);

        expect(ways.sort()).toEqual([...started.json().ways].sort());

        await app.inject({ method: 'POST', url: '/api/proxy' });
    });

    // Nothing needed the proxy yet, so the browser must be told to go straight out.
    it('hands back a file that proxies nothing until something needs it', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/proxy.pac' });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('proxy-autoconfig');
        expect(response.body).toContain('DIRECT');
        expect(response.body).not.toContain('PROXY');
    });

    it('answers 404 in the same shape as other errors', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/nope' });

        expect(response.statusCode).toBe(404);
        expect(response.json().error.requestId).toBeTruthy();
    });
});
