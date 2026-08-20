import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from './database.ts';

const migrations = join(__dirname, '..', '..', 'migrations');

describe('Database', () =>
{
    let db: Database;

    beforeEach(() =>
    {
        db = new Database(':memory:');
    });

    afterEach(() =>
    {
        db.close();
    });

    it('returns rows from a select', () =>
    {
        expect(db.prepare('SELECT 42 AS answer').all()).toEqual([{ answer: 42 }]);
    });

    // A value that looks like sql has to stay a value: bound, never pasted in.
    it('binds values instead of pasting them into the sql', () =>
    {
        db.exec('CREATE TABLE t (v TEXT)');
        db.prepare('INSERT INTO t (v) VALUES (?)').run("'; DROP TABLE t; --");

        expect(db.prepare('SELECT v FROM t').all()).toHaveLength(1);
    });

    it('keeps foreign keys enforced', () =>
    {
        db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY)');
        db.exec('CREATE TABLE child (parent_id INTEGER REFERENCES parent(id))');

        const orphan = db.prepare('INSERT INTO child (parent_id) VALUES (404)');

        expect(() => orphan.run()).toThrow();
    });

    it('applies migrations once and skips them afterwards', async () =>
    {
        const first = await db.migrate(migrations);
        const second = await db.migrate(migrations);

        expect(first.applied.length).toBeGreaterThan(0);
        expect(second.applied).toEqual([]);
        expect(second.skipped).toEqual(first.applied);
    });

    it('creates the schema the migration describes', async () =>
    {
        await db.migrate(migrations);

        const rows = db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .all() as { name: string }[];

        const tables = rows.map((row) => row.name);

        expect(tables).toContain('target_runs');
        expect(tables).toContain('samples');
    });

    // A file that fails halfway must not be recorded, or the next run skips it as
    // done and the missing tables stay missing.
    it('rolls a broken migration back and forgets it', async () =>
    {
        const directory = await mkdtemp(join(tmpdir(), 'netcheck-'));

        try
        {
            const sql = 'CREATE TABLE fine (id INTEGER); THIS IS NOT SQL;';
            await writeFile(join(directory, '001_bad.sql'), sql);

            await expect(db.migrate(directory)).rejects.toThrow(/001_bad\.sql/);

            const applied = db.prepare('SELECT version FROM schema_migrations').all();
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE name = 'fine'").all();

            expect(applied).toEqual([]);
            expect(tables).toEqual([]);
        }
        finally
        {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('reports the file that failed', async () =>
    {
        const directory = await mkdtemp(join(tmpdir(), 'netcheck-'));

        try
        {
            await writeFile(join(directory, '001_broken.sql'), 'SELECT * FROM nowhere;');

            await expect(db.migrate(directory)).rejects.toThrow('Migration 001_broken.sql failed');
        }
        finally
        {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('ignores files that are not sql', async () =>
    {
        const directory = await mkdtemp(join(tmpdir(), 'netcheck-'));

        try
        {
            await writeFile(join(directory, 'README.txt'), 'not a migration');

            expect(await db.migrate(directory)).toEqual({ applied: [], skipped: [] });
        }
        finally
        {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
