import 'dotenv/config';
import { join } from 'node:path';
import { Database } from './db/database';
import { ChecksRepository } from './db/checks.repository';
import { buildServer } from './http/server';

async function main(): Promise<void>
{
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString)
    {
        throw new Error('DATABASE_URL is not set. Copy .env.example to .env');
    }

    const db = new Database(connectionString);
    await db.migrate(join(__dirname, '..', 'migrations'));

    const app = await buildServer({ db, repository: new ChecksRepository(db) });
    const port = Number.parseInt(process.env.PORT ?? '3001', 10);

    // Shutdown order matters: stop accepting requests first, then drop the pool.
    // The other way round kills requests that are still being served.
    const shutdown = async (): Promise<void> =>
    {
        await app.close();
        await db.close();
        process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown());
    process.on('SIGINT', () => void shutdown());

    await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) =>
{
    console.error(err);
    process.exit(1);
});