// Entry point for the packaged binary. The workspace entry reads its migrations and
// its dashboard from disk; inside a single executable there is no disk to read, so
// both arrive as strings bundled at build time.

import { Database } from './db/database.ts';
import { ChecksRepository } from './db/checks.repository.ts';
import { placeDatabase, whereDatabase } from './db/place.ts';
import { buildServer } from './http/server.ts';
import { choosePort } from './http/port.ts';

// @ts-expect-error the alias is provided by the build script
import { built, migrations, version, web } from '#assets';

interface Asset
{
    name: string;
    sql: string;
}

const WANTED = 3001;

const TYPES: Record<string, string> =
{
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    png: 'image/png',
};

// Kept beside the code rather than read from a manifest the binary does not carry.
async function main(): Promise<void>
{
    // Somewhere like a mounted image or Program Files cannot be written to, and a
    // database error is not something to hand a person who wanted their internet
    // checked.
    const placed = placeDatabase(databaseFile());

    if (placed.refused !== null)
    {
        console.log(`Cannot write beside the program, so the history is kept in ${placed.file}`);
    }

    const db = new Database(placed.file);

    for (const file of migrations as Asset[])
    {
        db.applyBundled(file.name, file.sql);
    }

    // Running it twice, or having something else on the port, printed a stack trace
    // and left the person to work it out.
    const { port } = await choosePort(WANTED);

    const app = await buildServer(
    {
        db,
        repository: new ChecksRepository(db),
        databaseFile: placed.file,
        version,
        port,
        logLevel: 'warn',
        allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
    });

    const pages = web as Record<string, string>;

    app.get('/*', async (request, reply) =>
    {
        const path = request.url.split('?')[0]?.replace(/^\//, '') ?? '';
        const name = path === '' ? 'index.html' : path;
        const file = pages[name];

        if (file === undefined)
        {
            return reply.type(TYPES.html).send(Buffer.from(pages['index.html'] ?? '', 'base64'));
        }

        const extension = name.split('.').pop() ?? '';

        return reply.type(TYPES[extension] ?? 'application/octet-stream')
            .send(Buffer.from(file, 'base64'));
    });

    await app.listen({ port, host: '127.0.0.1' });

    console.log(`netcheck is running, built ${built}. `
        + `Open http://127.0.0.1:${port} in a browser.`);
    console.log('Close this window to stop it.');
}

/** Beside the executable, so the history follows the file the user moved around. */
function databaseFile(): string
{
    const beside = process.execPath.replace(/[^\\/]+$/, '');

    return whereDatabase(`${beside}netcheck.db`);
}

main().catch((err) =>
{
    console.error(err);
    process.exit(1);
});
