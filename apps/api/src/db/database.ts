import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool, types, type QueryResultRow } from 'pg';

// OID 701 is DOUBLE PRECISION. node-postgres returns it as a string to preserve
// precision on large values; latencies do not need that, and JSON should carry
// numbers rather than strings that silently concatenate on the client.
types.setTypeParser(701, (value: string) => Number.parseFloat(value));

export interface MigrationResult
{
    applied: string[];
    skipped: string[];
}

export class Database
{
    private readonly pool: Pool;

    constructor(connectionString: string)
    {
        this.pool = new Pool({
            connectionString,
            max: 10,
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
        });
    }

    query<T extends QueryResultRow>(text: string, values: unknown[] = [])
    {
        return this.pool.query<T>(text, values);
    }

    async ping(): Promise<number>
    {
        const started = performance.now();
        await this.pool.query('SELECT 1');

        return Math.round(performance.now() - started);
    }

    async close(): Promise<void>
    {
        await this.pool.end();
    }

    /** Applies pending migrations in file order, each inside its own transaction. */
    async migrate(directory: string): Promise<MigrationResult>
    {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `);

        const files = (await readdir(directory)).filter((f) => f.endsWith('.sql')).sort();
        const { rows } = await this.pool.query<{ version: string }>('SELECT version FROM schema_migrations');

        const done = new Set(rows.map((row) => row.version));
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
        const client = await this.pool.connect();

        try
        {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
            await client.query('COMMIT');
        }
        catch (err)
        {
            await client.query('ROLLBACK');
            throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
        }
        finally
        {
            // Returning the connection matters on every path: ten unreleased
            // clients exhaust the pool and the app hangs with no error.
            client.release();
        }
    }
}