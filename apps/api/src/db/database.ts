import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

export interface MigrationResult
{
    applied: string[];
    skipped: string[];
}

export class Database
{
    private readonly db: DatabaseSync;

    constructor(path: string)
    {
        this.db = new DatabaseSync(path);

        // SQLite ignores foreign keys unless told otherwise, so ON DELETE CASCADE
        // would silently do nothing. WAL keeps reads from blocking a write.
        this.db.exec('PRAGMA foreign_keys = ON');
        this.db.exec('PRAGMA journal_mode = WAL');
    }

    prepare(sql: string): StatementSync
    {
        return this.db.prepare(sql);
    }

    exec(sql: string): void
    {
        this.db.exec(sql);
    }

    close(): void
    {
        this.db.close();
    }

    /** Round trip to the file, so health reports a number rather than a guess. */
    ping(): number
    {
        const started = performance.now();
        this.db.prepare('SELECT 1').get();

        return Math.round(performance.now() - started);
    }

    /** Applies a migration that travelled inside the binary rather than on disk. */
    applyBundled(name: string, sql: string): void
    {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        `);

        const seen = this.db.prepare('SELECT version FROM schema_migrations WHERE version = ?');

        if (seen.get(name) !== undefined)
        {
            return;
        }

        this.run(name, sql);
    }

    /** Applies pending migrations in file order, each inside its own transaction. */
    async migrate(directory: string): Promise<MigrationResult>
    {
        this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)');

        const files = (await readdir(directory)).filter((f) => f.endsWith('.sql')).sort();
        const rows = this.db.prepare('SELECT version FROM schema_migrations').all();
        const done = new Set(rows.map((r) => r.version as string));

        const result: MigrationResult = { applied: [], skipped: [] };

        for (const file of files)
        {
            if (done.has(file))
            {
                result.skipped.push(file);
                continue;
            }

            await this.applyMigration(directory, file);
            result.applied.push(file);
        }

        return result;
    }

    private async applyMigration(directory: string, file: string): Promise<void>
    {
        this.run(file, await readFile(join(directory, file), 'utf8'));
    }

    private run(file: string, sql: string): void
    {
        this.db.exec('BEGIN');

        try
        {
            this.db.exec(sql);
            this.db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
            this.db.exec('COMMIT');
        }
        catch (err)
        {
            this.db.exec('ROLLBACK');
            throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
        }
    }
}