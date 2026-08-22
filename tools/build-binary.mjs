#!/usr/bin/env node

// Node's single executable cannot run TypeScript, and it cannot read files that sit
// beside it either: the whole program has to arrive as one bundled script with its
// assets inside. This turns the workspace into that script.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'build');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. The dashboard, built the ordinary way and then read back as text.
const buildWeb = ['run', 'build', '--workspace', '@netcheck/web'];

execFileSync('npm', buildWeb, { cwd: root, stdio: 'inherit' });

const web = collect(join(root, 'apps', 'web', 'dist'));

// 2. Migrations, which the packaged binary has no directory to read them from.
const migrationsDir = join(root, 'apps', 'api', 'migrations');

const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), 'utf8') }));

writeFileSync(join(out, 'assets.js'), `export const web = ${JSON.stringify(web)};\n`
    + `export const migrations = ${JSON.stringify(migrations)};\n`);

// 3. One script. Fastify reaches for a few modules by name at runtime, so it is bundled
// rather than left as an import the binary would not be able to resolve.
await build(
{
    entryPoints: [join(root, 'apps', 'api', 'src', 'sea.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: join(out, 'netcheck.cjs'),
    external: ['node:sqlite'],
    alias: { '#assets': join(out, 'assets.js') },
    logLevel: 'info',
});

writeFileSync(join(out, 'sea-config.json'), JSON.stringify(
{
    main: 'build/netcheck.cjs',
    output: 'build/netcheck.blob',
    disableExperimentalSEAWarning: true,
}, null, 4) + '\n');

console.log('\nbundle ready in build/');

/** Reads a directory into a name → contents map, so the files travel inside the binary. */
function collect(directory, prefix = '')
{
    const files = {};

    for (const entry of readdirSync(directory, { withFileTypes: true }))
    {
        const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;

        if (entry.isDirectory())
        {
            Object.assign(files, collect(join(directory, entry.name), path));
            continue;
        }

        files[path] = readFileSync(join(directory, entry.name), 'base64');
    }

    return files;
}
