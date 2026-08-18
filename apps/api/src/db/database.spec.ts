import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Database } from './database';
import { ChecksRepository } from './checks.repository';
import { computeStatistics, type Sample } from '../probe/statistics';
import type { TargetResult } from '../probe/probe';

const connectionString = process.env.TEST_DATABASE_URL;
const migrations = join(__dirname, '..', '..', 'migrations');

const ok = (ms: number): Sample => ({ reachable: true, latencyMs: ms, error: null });
const failed = (): Sample => ({ reachable: false, latencyMs: null, error: 'timeout' });

const resultFor = (samples: Sample[]): TargetResult => (
{
    target: { name: 'test', host: '127.0.0.1', port: 443 },
    samples,
    statistics: computeStatistics(samples),
});

describe.skipIf(!connectionString)('ChecksRepository', () =>
{
    let db: Database;
    let repository: ChecksRepository;

    beforeAll(async () =>
    {
        db = new Database(connectionString as string);
        await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        await db.migrate(migrations);

        repository = new ChecksRepository(db);
    });

    afterAll(async () =>
    {
        await db.close();
    });

    beforeEach(async () =>
    {
        await db.query('TRUNCATE checks, target_runs, samples RESTART IDENTITY CASCADE');
    });

    it('applies migrations once and skips them afterwards', async () =>
    {
        const result = await db.migrate(migrations);

        expect(result.applied).toEqual([]);
        expect(result.skipped.length).toBeGreaterThan(0);
    });

    it('seeds the default targets', async () =>
    {
        const targets = await repository.listTargets();

        expect(targets).toHaveLength(4);
        expect(targets[0]).toMatchObject({ port: 443, enabled: true });
    });

    it('stores a run together with its samples', async () =>
    {
        const targets = await repository.listTargets();
        const checkId = await repository.createCheck(3, 2000);
        const runId = await repository.saveResult(checkId, targets[0].id, resultFor([ok(10), ok(20), ok(15)]));

        const { rows } = await db.query<{ count: string }>('SELECT count(*) FROM samples WHERE target_run_id = $1', [runId]);

        expect(rows[0].count).toBe('3');
    });

    it('keeps latency precision through the round trip', async () =>
    {
        const targets = await repository.listTargets();
        const checkId = await repository.createCheck(1, 2000);
        await repository.saveResult(checkId, targets[0].id, resultFor([ok(12.34)]));

        const status = await repository.latestStatus();
        const row = status.find((v) => v.targetId === targets[0].id);

        expect(row?.averageMs).toBe(12.34);
        expect(typeof row?.averageMs).toBe('number');
    });

    it('stores nulls for an unreachable target rather than zeros', async () =>
    {
        const targets = await repository.listTargets();
        const checkId = await repository.createCheck(2, 2000);
        await repository.saveResult(checkId, targets[0].id, resultFor([failed(), failed()]));

        const status = await repository.latestStatus();
        const row = status.find((v) => v.targetId === targets[0].id);

        expect(row?.averageMs).toBeNull();
        expect(row?.lossPercent).toBe(100);
        expect(row?.quality).toBe('unusable');
    });

    it('returns every enabled target even before the first check', async () =>
    {
        const status = await repository.latestStatus();

        expect(status).toHaveLength(4);
        expect(status.every((v) => v.quality === null)).toBe(true);
    });

    it('reports only the newest run per target', async () =>
    {
        const targets = await repository.listTargets();

        const first = await repository.createCheck(1, 2000);
        await repository.saveResult(first, targets[0].id, resultFor([ok(500)]));

        await new Promise((resolve) => setTimeout(resolve, 20));

        const second = await repository.createCheck(1, 2000);
        await repository.saveResult(second, targets[0].id, resultFor([ok(10)]));

        const status = await repository.latestStatus();
        const row = status.find((v) => v.targetId === targets[0].id);

        expect(row?.averageMs).toBe(10);
    });

    it('removes runs and samples when a check is deleted', async () =>
    {
        const targets = await repository.listTargets();
        const checkId = await repository.createCheck(1, 2000);
        await repository.saveResult(checkId, targets[0].id, resultFor([ok(10)]));

        await db.query('DELETE FROM checks WHERE id = $1', [checkId]);

        const runs = await db.query<{ count: string }>('SELECT count(*) FROM target_runs');
        const samples = await db.query<{ count: string }>('SELECT count(*) FROM samples');

        expect(runs.rows[0].count).toBe('0');
        expect(samples.rows[0].count).toBe('0');
    });

    it('rejects an impossible port at the database level', async () =>
    {
        await expect(
            db.query('INSERT INTO targets (name, host, port) VALUES ($1, $2, $3)', ['bad', 'x.test', 0]),
        ).rejects.toThrow();
    });
});