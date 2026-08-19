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

    /** Applies pending migrations in file order, each inside its own transaction. */
    async migrate(directory: string): Promise<MigrationResult>
    {
        this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)');

        const files = (await readdir(directory)).filter((f) => f.endsWith('.sql')).sort();
        const done = new Set(this.db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version as string));

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
        const sql = await readFile(join(directory, file), 'utf8');

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