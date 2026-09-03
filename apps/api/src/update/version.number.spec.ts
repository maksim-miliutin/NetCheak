import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');

const read = (where: string): { version?: string } =>
    JSON.parse(readFileSync(join(ROOT, where), 'utf8'));

describe('the version', () =>
{
    /**
     * It was written out by hand in two entry points as 1.0.0 while the file it was
     * copied from said 0.1.0, so a release said one thing and the running program
     * another, and nothing complained.
     */
    it('is written down in one place and nowhere else', () =>
    {
        const source = ['apps/api/src', 'apps/web/src', 'tools'];
        const hardcoded: string[] = [];

        const walk = (folder: string): void =>
        {
            for (const entry of readdirSync(join(ROOT, folder), { withFileTypes: true }))
            {
                const path = `${folder}/${entry.name}`;

                if (entry.isDirectory())
                {
                    walk(path);
                    continue;
                }

                if (!/\.(ts|tsx|mjs)$/.test(entry.name) || /\.spec\./.test(entry.name))
                {
                    continue;
                }

                const text = readFileSync(join(ROOT, path), 'utf8');

                if (/(const|let)\s+VERSION\s*=\s*['"`]\d/.test(text))
                {
                    hardcoded.push(path);
                }
            }
        };

        source.forEach(walk);

        expect(hardcoded).toEqual([]);
    });

    it('says the same thing in every package that carries one', () =>
    {
        const root = read('package.json').version;

        expect(root).toBeTruthy();
        expect(read('apps/api/package.json').version).toBe(root);
        expect(read('apps/web/package.json').version).toBe(root);
    });
});
