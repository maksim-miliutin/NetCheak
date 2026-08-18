import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Database } from '../db/database';
import { ChecksRepository } from '../db/checks.repository';
import { buildServer } from './server';

const connectionString = process.env.TEST_DATABASE_URL;
const migrations = join(__dirname, '..', '..', 'migrations');

describe.skipIf(!connectionString)('HTTP API', () =>
{
    let db: Database;
    let app: FastifyInstance;

    beforeAll(async () =>
    {
        db = new Database(connectionString as string);
        await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        await db.migrate(migrations);

        app = await buildServer({ db, repository: new ChecksRepository(db), logLevel: 'silent' });
    });

    afterAll(async () =>
    {
        await app.close();
        await db.close();
    });

    beforeEach(async () =>
    {
        await db.query('TRUNCATE checks, target_runs, samples RESTART IDENTITY CASCADE');
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

    it('runs a check against a local port and stores the result', async () =>
    {
        await db.query('UPDATE targets SET enabled = false');
        await db.query('INSERT INTO targets (name, host, port) VALUES ($1, $2, $3)', ['local', '127.0.0.1', 1]);

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

    it('answers 404 in the same shape as other errors', async () =>
    {
        const response = await app.inject({ method: 'GET', url: '/api/nope' });

        expect(response.statusCode).toBe(404);
        expect(response.json().error.requestId).toBeTruthy();
    });
});