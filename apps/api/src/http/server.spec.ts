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

    it('answers 404 in the same shape as other errors', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/nope' });

        expect(response.statusCode).toBe(404);
        expect(response.json().error.requestId).toBeTruthy();
    });
});