import { join } from 'node:path';
import { Database } from './db/database';
import { ChecksRepository } from './db/checks.repository';
import { buildServer } from './http/server';

const DEFAULT_PORT = 3001;

async function main(): Promise<void>
{
    // A path, not a connection string: the whole point of SQLite here is that the
    // tool carries its own storage and starts with nothing installed.
    const file = process.env.NETCHECK_DB ?? join(process.cwd(), 'netcheck.db');

    const db = new Database(file);
    await db.migrate(join(__dirname, '..', 'migrations'));

    const app = await buildServer({ db, repository: new ChecksRepository(db) });
    const port = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

    // Shutdown order matters: stop accepting requests first, then close the file.
    // The other way round kills requests that are still being served.
    const shutdown = async (): Promise<void> =>
    {
        await app.close();
        db.close();
        process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown());
    process.on('SIGINT', () => void shutdown());

    await app.listen({ port, host: '127.0.0.1' });
}

main().catch((err) =>
{
    console.error(err);
    process.exit(1);
});
