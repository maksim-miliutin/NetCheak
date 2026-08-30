import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Database } from './db/database.ts';
import { ChecksRepository } from './db/checks.repository.ts';
import { placeDatabase } from './db/place.ts';
import { buildServer } from './http/server.ts';
import { choosePort } from './http/port.ts';

const DEFAULT_PORT = 3001;

// ESM has no __dirname, and the migrations sit beside the source rather than beside
// whatever directory the process happened to start in.
const here = dirname(fileURLToPath(import.meta.url));

// Kept beside the code rather than read from a manifest the binary does not carry.
const VERSION = '1.0.0';

async function main(): Promise<void>
{
    // A path, not a connection string: the whole point of SQLite here is that the
    // tool carries its own storage and starts with nothing installed.
    const file = process.env.NETCHECK_DB ?? join(process.cwd(), 'netcheck.db');

    const placed = placeDatabase(file);

    if (placed.refused !== null)
    {
        console.log(`Cannot write to ${placed.refused}, so the history is kept in`);
        console.log(placed.file);
    }

    const db = new Database(placed.file);
    await db.migrate(join(here, '..', 'migrations'));

    // The port is settled first: the server needs to know where it will be reachable
    // in order to point the system proxy setting at its own file.
    const wanted = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
    const { port, skipped } = await choosePort(wanted);

    const app = await buildServer(
        { db, repository: new ChecksRepository(db), version: VERSION, port });

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

    if (skipped > 0)
    {
        console.log(`Port ${wanted} was taken, so this is on ${port} instead.`);
    }
}

main().catch((err) =>
{
    console.error(err);
    process.exit(1);
});
