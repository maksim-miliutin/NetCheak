import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Database } from './database.ts';
import { ChecksRepository, type StatusRow } from './checks.repository.ts';
import { computeStatistics, type Sample } from '../probe/statistics.ts';
import type { TargetResult } from '../probe/probe.ts';

const migrations = join(__dirname, '..', '..', 'migrations');

const ok = (ms: number): Sample => ({ reachable: true, latencyMs: ms, error: null });
const failed = (): Sample => ({ reachable: false, latencyMs: null, error: 'timeout' });

/** Moves a check back in time, since a test cannot wait a month for one to age. */
function age(db: Database, checkId: number, days: number): void
{
    db.prepare("UPDATE checks SET started_at = datetime('now', ?) WHERE id = ?")
        .run(`-${days} days`, checkId);
}

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

    // A site nobody objects to measures the line and nothing else, which is the wrong
    // side of the question this tool asks.
    it('watches nothing that sits on the far side of the question', () =>
    {
        const hosts = repository.listTargets().map((one) => one.host);

        expect(hosts).not.toContain('ya.ru');
        expect(hosts).toContain('wikipedia.org');
    });

    it('adds a target and hands it back', () =>
    {
        const added = repository.addTarget('Mine', 'my.example', 8443);

        expect(added).toMatchObject({ host: 'my.example', port: 8443, enabled: true });
        expect(repository.listTargets()).toHaveLength(5);
    });

    // The same host and port twice is the same target, not a second row.
    it('returns the existing target rather than adding it twice', () =>
    {
        const first = repository.addTarget('Mine', 'my.example', 443);
        const again = repository.addTarget('Mine again', 'my.example', 443);

        expect(again.id).toBe(first.id);
        expect(repository.listTargets()).toHaveLength(5);
    });

    it('brings a retired target back rather than adding a second one', () =>
    {
        const added = repository.addTarget('Mine', 'my.example', 443);

        repository.removeTarget(added.id);
        expect(repository.addTarget('Mine', 'my.example', 443).enabled).toBe(true);
    });

    // The runs are the history of a line, so retiring a target must not erase them.
    it('keeps the measurements of a target that was removed', () =>
    {
        const target = only(repository.listTargets(), 'target');
        const checkId = repository.createCheck(1, 2000);

        repository.saveResult(checkId, target.id, resultFor([ok(10)]));
        repository.removeTarget(target.id);

        expect(count(db, 'target_runs')).toBe(1);
        expect(repository.latestStatus().some((v) => v.targetId === target.id)).toBe(false);
    });

    it('says nothing was removed when the id is unknown', () =>
    {
        expect(repository.removeTarget(9999)).toBe(false);
    });

    // A line that drops for a minute every evening looks perfect in the latest check.
    it('keeps every run, not only the last one', () =>
    {
        const target = only(repository.listTargets(), 'target');

        for (const samples of [[ok(10)], [failed()], [ok(12)]])
        {
            repository.saveResult(repository.createCheck(1, 2000), target.id, resultFor(samples));
        }

        const history = repository.history().find((v) => v.targetId === target.id);

        expect(history?.runs).toHaveLength(3);
        expect(history?.lossyRuns).toBe(1);
    });

    it('hands the runs back oldest first, so a strip reads left to right', () =>
    {
        const target = only(repository.listTargets(), 'target');

        repository.saveResult(repository.createCheck(1, 2000), target.id, resultFor([failed()]));
        repository.saveResult(repository.createCheck(1, 2000), target.id, resultFor([ok(10)]));

        const history = repository.history().find((v) => v.targetId === target.id);

        expect(history?.runs.map((r) => r.lossPercent)).toEqual([100, 0]);
    });

    it('keeps only as many runs as asked for', () =>
    {
        const target = only(repository.listTargets(), 'target');

        for (let i = 0; i < 5; i += 1)
        {
            repository.saveResult(repository.createCheck(1, 2000), target.id, resultFor([ok(10)]));
        }

        expect(repository.history(2).find((v) => v.targetId === target.id)?.runs).toHaveLength(2);
    });

    it('says nothing about a target that was never checked', () =>
    {
        expect(repository.history()).toEqual([]);
    });

    it('leaves out a target that was retired', () =>
    {
        const target = only(repository.listTargets(), 'target');

        repository.saveResult(repository.createCheck(1, 2000), target.id, resultFor([ok(10)]));
        repository.removeTarget(target.id);

        expect(repository.history().some((v) => v.targetId === target.id)).toBe(false);
    });

    // Numbering every run to keep the first of each read the whole table: at a year of
    // automatic checking that was over a second for four answers. The plan is asserted
    // rather than the clock, since a timing test on a build machine proves nothing.
    it('reads the latest run down the index instead of ranking the table', () =>
    {
        const target = only(repository.listTargets(), 'target');

        repository.saveResult(repository.createCheck(1, 2000), target.id, resultFor([ok(10)]));

        const plan = db
            .prepare('EXPLAIN QUERY PLAN SELECT id FROM target_runs WHERE target_id = 1'
                + ' ORDER BY id DESC LIMIT 1')
            .all() as { detail: string }[];

        expect(plan.some((row) => /USING (COVERING )?INDEX/.test(row.detail))).toBe(true);
        expect(plan.some((row) => row.detail.startsWith('SCAN'))).toBe(false);
    });

    // The attempts are read for the newest run and never again, yet they are two
    // thirds of the file.
    it('sweeps the attempts of runs older than the window', () =>
    {
        const target = only(repository.listTargets(), 'target');

        const old = repository.createCheck(1, 2000);
        age(db, old, 30);
        repository.saveResult(old, target.id, resultFor([ok(10), ok(12)]));

        repository.saveResult(repository.createCheck(1, 2000), target.id, resultFor([ok(11)]));

        expect(repository.prune().samples).toBe(2);
        expect(count(db, 'samples')).toBe(1);
    });

    // The summaries are what the history draws, so they outlive the attempts.
    it('keeps the run itself when its attempts are swept', () =>
    {
        const target = only(repository.listTargets(), 'target');
        const old = repository.createCheck(1, 2000);

        age(db, old, 30);
        repository.saveResult(old, target.id, resultFor([ok(10)]));
        repository.prune();

        expect(count(db, 'target_runs')).toBe(1);
        expect(repository.history()[0]?.runs).toHaveLength(1);
    });

    it('sweeps a check once it is older than the longer window', () =>
    {
        const target = only(repository.listTargets(), 'target');
        const ancient = repository.createCheck(1, 2000);

        age(db, ancient, 400);
        repository.saveResult(ancient, target.id, resultFor([ok(10)]));

        expect(repository.prune().checks).toBe(1);
        expect(count(db, 'target_runs')).toBe(0);
    });

    // The sweep works by a boundary rather than a list of ids, which is only correct
    // while ids rise with the clock. A run newer than the boundary must survive even
    // though an older one beside it goes.
    it('sweeps up to the boundary and no further', () =>
    {
        const target = only(repository.listTargets(), 'target');

        const old = repository.createCheck(1, 2000);
        age(db, old, 30);
        repository.saveResult(old, target.id, resultFor([ok(10), ok(11)]));

        const fresh = repository.createCheck(1, 2000);
        repository.saveResult(fresh, target.id, resultFor([ok(12), ok(13), ok(14)]));

        repository.prune();

        expect(count(db, 'samples')).toBe(3);
    });

    it('leaves everything alone when nothing is old enough', () =>
    {
        const target = only(repository.listTargets(), 'target');

        repository.saveResult(repository.createCheck(1, 2000), target.id, resultFor([ok(10)]));

        expect(repository.prune()).toEqual({ samples: 0, checks: 0, names: 0 });
        expect(count(db, 'samples')).toBe(1);
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

    describe('routed hosts', () =>
    {
        it('keeps a host and the way that got it through', () =>
        {
            repository.routeHost('example.com', 'name', false);

            expect(repository.listRouted())
                .toEqual([{ host: 'example.com', way: 'name', byHand: false }]);
        });

        it('does not let a later finding overrule what a person set by hand', () =>
        {
            repository.routeHost('example.com', 'tiny', true);
            repository.routeHost('example.com', 'name', false);

            expect(repository.listRouted()[0].way).toBe('tiny');
        });

        it('lets a person overrule what a check found', () =>
        {
            repository.routeHost('example.com', 'name', false);
            repository.routeHost('example.com', 'tiny', true);

            expect(repository.listRouted()[0])
                .toEqual({ host: 'example.com', way: 'tiny', byHand: true });
        });

        it('puts the ones set by hand first', () =>
        {
            repository.routeHost('found.example', 'name', false);
            repository.routeHost('typed.example', 'tiny', true);

            expect(repository.listRouted().map((row) => row.host))
                .toEqual(['typed.example', 'found.example']);
        });

        it('says nothing was there when forgetting a host it never had', () =>
        {
            expect(repository.forgetRoute('nobody.example')).toBe(false);
        });

        it('forgets a host it was given', () =>
        {
            repository.routeHost('example.com', 'name', true);

            expect(repository.forgetRoute('example.com')).toBe(true);
            expect(repository.listRouted()).toEqual([]);
        });
    });

    describe('what the driver found', () =>
    {
        const FOUND = { host: 'discord.com', fooling: 'ttl', ttl: 6, repeats: 6 };

        it('keeps what got a site through', () =>
        {
            repository.rememberDriver(FOUND);

            expect(repository.listDriverFound()).toEqual([FOUND]);
        });

        // What worked last week may not work today, and the fresher answer is the one
        // that was actually tried.
        it('lets a later search overrule an earlier one', () =>
        {
            repository.rememberDriver(FOUND);
            repository.rememberDriver({ ...FOUND, fooling: 'badseq', ttl: 4 });

            expect(repository.listDriverFound())
                .toEqual([{ ...FOUND, fooling: 'badseq', ttl: 4 }]);
        });

        it('keeps each site apart from the others', () =>
        {
            repository.rememberDriver(FOUND);
            repository.rememberDriver({ ...FOUND, host: 'rutracker.org' });

            expect(repository.listDriverFound()).toHaveLength(2);
        });

        it('forgets a site it was given', () =>
        {
            repository.rememberDriver(FOUND);

            expect(repository.forgetDriver('discord.com')).toBe(true);
            expect(repository.listDriverFound()).toEqual([]);
        });

        it('says nothing was there when forgetting a site it never had', () =>
        {
            expect(repository.forgetDriver('nobody.example')).toBe(false);
        });
    });

    describe('what it lets go of', () =>
    {
        // A promise about not keeping names of sites was true only of the tables
        // somebody had thought about, and these two were not among them.
        it('lets go of a name a check wrote down long enough ago', () =>
        {
            repository.rememberDriver(
                { host: 'old.example', fooling: 'ttl', ttl: 6, repeats: 6 });

            db.exec("UPDATE driver_found SET found_at = datetime('now', '-200 days')");

            expect(repository.prune().names).toBe(1);
            expect(repository.listDriverFound()).toEqual([]);
        });

        // Somebody chose it. A tool that forgets what it was told is worse than one
        // that remembers too long.
        it('keeps a site somebody put in by hand, however old', () =>
        {
            repository.routeHost('mine.example', 'name', true);

            db.exec("UPDATE routed_hosts SET noted_at = datetime('now', '-900 days')");

            repository.prune();

            expect(repository.listRouted().map((one) => one.host))
                .toContain('mine.example');
        });

        it('lets go of one the check found by itself', () =>
        {
            repository.routeHost('found.example', 'name', false);

            db.exec("UPDATE routed_hosts SET noted_at = datetime('now', '-900 days')");

            repository.prune();

            expect(repository.listRouted()).toEqual([]);
        });
    });
});
