import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..');

/**
 * The README says how the project is laid out, and three folders had appeared since
 * anybody looked. Documentation that lies is worse than none: somebody reads it,
 * believes it, and looks for a thing where it is not.
 */
describe('the layout the README promises', () =>
{
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const said = readme.slice(readme.indexOf('## Layout'),
        readme.indexOf('## Where the time goes'));

    const promised = new Set([...said.matchAll(/^ {4}(\w+)\//gm)].map((m) => m[1]));

    const folders = (where: string): string[] =>
        readdirSync(join(ROOT, where), { withFileTypes: true })
            .filter((one) => one.isDirectory())
            .map((one) => one.name);

    it.each(['apps/api/src', 'apps/web/src'])('names every folder in %s', (where) =>
    {
        const missing = folders(where).filter((one) => !promised.has(one));

        expect(missing, `${where}: not in the README`).toEqual([]);
    });

    // The other way round matters too: a folder named here and gone from disk sends
    // somebody looking for something that was deleted.
    it('names nothing that is no longer there', () =>
    {
        const real = new Set([...folders('apps/api/src'), ...folders('apps/web/src')]);
        const gone = [...promised].filter((one) => !real.has(one));

        expect(gone).toEqual([]);
    });
});
