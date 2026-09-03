#!/usr/bin/env node

// Node's single executable cannot run TypeScript, and it cannot read files that sit
// beside it either: the whole program has to arrive as one bundled script with its
// assets inside. This turns the workspace into that script.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync,
    writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { platform } from 'node:process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'build');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. The dashboard, built the ordinary way and then read back as text.
const buildWeb = ['run', 'build', '--workspace', '@netcheck/web'];

// On Windows npm is npm.cmd, which execFileSync will not find by the bare name and
// which Node refuses to start without a shell since that was made a security matter.
// Asking for the shell there rather than everywhere keeps the arguments unquoted on
// the systems that do not need it.
// npm points at its own entry when it is npm running this, and going through Node
// straight to that file needs no shell at all. Handing arguments to a shell is what
// Node now warns about, and the warning is fair: nothing here escapes them.
const own = process.env.npm_execpath;

const windows = platform === 'win32';

if (own === undefined)
{
    execFileSync(windows ? 'npm.cmd' : 'npm', buildWeb,
        { cwd: root, stdio: 'inherit', shell: windows });
}
else
{
    execFileSync(process.execPath, [own, ...buildWeb], { cwd: root, stdio: 'inherit' });
}

const web = collect(join(root, 'apps', 'web', 'dist'));

// 2. Migrations, which the packaged binary has no directory to read them from.
const migrationsDir = join(root, 'apps', 'api', 'migrations');

const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), 'utf8') }));

// When it was built, said out loud at startup. A binary left over from before the
// last change looks exactly like a fresh one, and ten minutes went into wondering why
// a block that had been added was not on the page.
const built = new Date().toISOString().slice(0, 16).replace('T', ' ');

// One number, taken from where npm keeps it. It was written out by hand in two entry
// points and disagreed with the file it was copied from, so a release said one thing
// and the program another.
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

writeFileSync(join(out, 'assets.js'), `export const web = ${JSON.stringify(web)};\n`
    + `export const migrations = ${JSON.stringify(migrations)};\n`
    + `export const built = ${JSON.stringify(built)};\n`
    + `export const version = ${JSON.stringify(version)};\n`);

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

// 5. One file that runs without Node installed. The blob goes inside a copy of the
// Node that built it: what comes out is that Node plus this program, and nothing to
// install beside it.
const suffix = windows ? '.exe' : '';
const standalone = join(out, `netcheck${suffix}`);

execFileSync(process.execPath, ['--experimental-sea-config', join(out, 'sea-config.json')],
    { stdio: 'inherit' });

copyFileSync(process.execPath, standalone);

if (platform === 'darwin')
{
    // A signed executable refuses to be written into, and the one that ships is signed.
    execFileSync('codesign', ['--remove-signature', standalone], { stdio: 'inherit' });
}

const inject =
[
    standalone,
    'NODE_SEA_BLOB',
    join(out, 'netcheck.blob'),
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
];

if (platform === 'darwin')
{
    inject.push('--macho-segment-name', 'NODE_SEA');
}

// Straight to npx's own entry through Node, for the same reason as the web build
// above: handing arguments to a shell is what Node now warns about.
const run = own === undefined
    ? { file: 'npx', args: ['postject', ...inject], shell: windows }
    : { file: process.execPath,
        args: [join(dirname(own), 'npx-cli.js'), 'postject', ...inject],
        shell: false };

execFileSync(run.file, run.args, { cwd: root, stdio: 'inherit', shell: run.shell });

if (platform === 'darwin')
{
    execFileSync('codesign', ['--sign', '-', standalone], { stdio: 'inherit' });
}

const size = (statSync(standalone).size / 1024 / 1024).toFixed(0);

console.log(`\nbundle ready in build/, and ${basename(standalone)} runs on its own (${size} MB)`);

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
