import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Database } from './db/database.ts';
import { ChecksRepository } from './db/checks.repository.ts';
import { buildServer } from './http/server.ts';

const DEFAULT_PORT = 3001;

// ESM has no __dirname, and the migrations sit beside the source rather than beside
// whatever directory the process happened to start in.
const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void>
{
    // A path, not a connection string: the whole point of SQLite here is that the
    // tool carries its own storage and starts with nothing installed.
    const file = process.env.NETCHECK_DB ?? join(process.cwd(), 'netcheck.db');

    const db = new Database(file);
    await db.migrate(join(here, '..', 'migrations'));

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
