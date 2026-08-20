import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Database } from './database.ts';
import { ChecksRepository, type StatusRow } from './checks.repository.ts';
import { computeStatistics, type Sample } from '../probe/statistics.ts';
import type { TargetResult } from '../probe/probe.ts';

const migrations = join(__dirname, '..', '..', 'migrations');

const ok = (ms: number): Sample => ({ reachable: true, latencyMs: ms, error: null });
const failed = (): Sample => ({ reachable: false, latencyMs: null, error: 'timeout' });

function count(db: Database, table: string): number
{
    return (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function find(status: StatusRow[], targetId: number): StatusRow
{
    const rows = status.filter((v) => v.targetId === targetId);

    return only(rows, `status for target ${targetId}`);
}

// Unwrapping here keeps every test free of non-null assertions and readable
// under noUncheckedIndexedAccess.
function only<T>(rows: T[], what: string): T
{
    const [row] = rows;

    if (row === undefined)
    {
        throw new Error(`expected at least one ${what}`);
    }

    return row;
}

const resultFor = (samples: Sample[]): TargetResult => (
{
    target: { name: 'test', host: '127.0.0.1', port: 443 },
    samples,
    statistics: computeStatistics(samples),
});

describe('ChecksRepository', () =>
{
    let db: Database;
    let repository: ChecksRepository;

    // A file database would need cleaning between tests and would drag the suite
    // from milliseconds into seconds; in memory each test starts from the schema.
    beforeEach(async () =>
    {
        db = new Database(':memory:');
        await db.migrate(migrations);

        repository = new ChecksRepository(db);
    });

    afterEach(() =>
    {
        db.close();
    });

    it('seeds the default targets', async () =>
    {
        const targets = repository.listTargets();

        expect(targets).toHaveLength(4);
        expect(only(targets, 'target')).toMatchObject({ port: 443, enabled: true });
    });

    it('stores a run together with its samples', async () =>
    {
        const target = only(repository.listTargets(), 'target');
        const checkId = repository.createCheck(3, 2000);
        const samples = [ok(10), ok(20), ok(15)];
        const runId = repository.saveResult(checkId, target.id, resultFor(samples));

        const row = db
            .prepare('SELECT count(*) AS count FROM samples WHERE target_run_id = ?')
            .get(runId) as { count: number };

        expect(row.count).toBe(3);
    });

    it('keeps latency precision through the round trip', async () =>
    {
        const target = only(repository.listTargets(), 'target');
        const checkId = repository.createCheck(1, 2000);
        repository.saveResult(checkId, target.id, resultFor([ok(12.34)]));

        const row = find(repository.latestStatus(), target.id);

        expect(row?.averageMs).toBe(12.34);
        expect(typeof row?.averageMs).toBe('number');
    });

    it('stores nulls for an unreachable target rather than zeros', async () =>
    {
        const target = only(repository.listTargets(), 'target');
        const checkId = repository.createCheck(2, 2000);
        repository.saveResult(checkId, target.id, resultFor([failed(), failed()]));

        const row = find(repository.latestStatus(), target.id);

        expect(row?.averageMs).toBeNull();
        expect(row?.lossPercent).toBe(100);
        expect(row?.quality).toBe('unusable');
    });

    it('returns every enabled target even before the first check', async () =>
    {
        const status = repository.latestStatus();

        expect(status).toHaveLength(4);
        expect(status.every((v) => v.quality === null)).toBe(true);
        expect(status.every((v) => v.samples.length === 0)).toBe(true);
    });

    // started_at only has second resolution, so two checks in the same second tie
    // and the run id has to break it.
    it('reports only the newest run per target', async () =>
    {
        const target = only(repository.listTargets(), 'target');

        const first = repository.createCheck(1, 2000);
        repository.saveResult(first, target.id, resultFor([ok(500)]));

        const second = repository.createCheck(1, 2000);
        repository.saveResult(second, target.id, resultFor([ok(10)]));

        const row = find(repository.latestStatus(), target.id);

        expect(row?.averageMs).toBe(10);
    });

    it('carries samples back as booleans in order', async () =>
    {
        const target = only(repository.listTargets(), 'target');
        const checkId = repository.createCheck(3, 2000);
        repository.saveResult(checkId, target.id, resultFor([ok(11), failed(), ok(13)]));

        const row = find(repository.latestStatus(), target.id);

        expect(row?.samples).toEqual([
            { reachable: true, latencyMs: 11 },
            { reachable: false, latencyMs: null },
            { reachable: true, latencyMs: 13 },
        ]);
    });

    it('removes runs and samples when a check is deleted', async () =>
    {
        const target = only(repository.listTargets(), 'target');
        const checkId = repository.createCheck(1, 2000);
        repository.saveResult(checkId, target.id, resultFor([ok(10)]));

        db.prepare('DELETE FROM checks WHERE id = ?').run(checkId);

        expect(count(db, 'target_runs')).toBe(0);
        expect(count(db, 'samples')).toBe(0);
    });

    it('rejects an impossible port at the database level', async () =>
    {
        const insert = db.prepare('INSERT INTO targets (name, host, port) VALUES (?, ?, ?)');

        expect(() => insert.run('bad', 'x.test', 0)).toThrow();
    });

    it('leaves nothing behind when the samples insert fails', async () =>
    {
        const target = only(repository.listTargets(), 'target');
        const checkId = repository.createCheck(1, 2000);

        const broken = resultFor([ok(10)]);
        (broken.samples as unknown[]).push(null);

        expect(() => repository.saveResult(checkId, target.id, broken)).toThrow();

        expect(count(db, 'target_runs')).toBe(0);
    });
});
