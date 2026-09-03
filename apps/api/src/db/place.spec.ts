import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readdirSync, rmSync, writeFileSync }
    from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { isWritable, placeDatabase, whereDatabase } from './place.ts';

const made: string[] = [];

function folder(mode = 0o755): string
{
    const path = mkdtempSync(join(tmpdir(), 'place-'));

    chmodSync(path, mode);
    made.push(path);

    return path;
}

afterEach(() =>
{
    for (const path of made.splice(0))
    {
        chmodSync(path, 0o755);
        rmSync(path, { recursive: true, force: true });
    }
});

describe('isWritable', () =>
{
    it('says an ordinary folder is writable', () =>
    {
        expect(isWritable(folder())).toBe(true);
    });

    it('says a folder that does not exist is not', () =>
    {
        expect(isWritable('/no/such/folder/at/all')).toBe(false);
    });

    // The probe has to clean up after itself, or the folder fills with leftovers.
    it('leaves nothing behind', () =>
    {
        const path = folder();

        isWritable(path);

        expect(readdirSync(path)).toEqual([]);
    });
});

describe('placeDatabase', () =>
{
    it('keeps the file where it was asked for when that works', () =>
    {
        const wanted = join(folder(), 'netcheck.db');

        expect(placeDatabase(wanted)).toEqual({ file: wanted, refused: null });
    });

    // A read-only share or a mounted image is somewhere people run downloads from.
    // The folder is one nobody may write to, since a test running as an administrator
    // would walk straight through permission bits.
    it('falls back to the home folder when the place cannot be written', () =>
    {
        const wanted = '/proc/self/netcheck.db';
        const placed = placeDatabase(wanted);

        expect(placed.file.startsWith(homedir())).toBe(true);
        expect(placed.refused).toBe(wanted);
    });

    // A locked down account may have no home to write to either, and falling over at
    // the second step would be the same failure one floor down.
    it('falls back again to the temporary folder', () =>
    {
        const placed = placeDatabase('/proc/self/netcheck.db');

        expect(placed.file.startsWith(homedir()) || placed.file.startsWith(tmpdir())).toBe(true);
    });

    it('names the place it could not use, so the reason can be said', () =>
    {
        expect(placeDatabase('/proc/self/netcheck.db').refused).toContain('netcheck.db');
    });
});

describe('whereDatabase', () =>
{
    const был = process.env.NETCHECK_DB;

    afterEach(() =>
    {
        if (был === undefined)
        {
            delete process.env.NETCHECK_DB;
        }
        else
        {
            process.env.NETCHECK_DB = был;
        }
    });

    it('takes the place it was told to take, over everything else', () =>
    {
        process.env.NETCHECK_DB = join(tmpdir(), 'told-to.db');

        expect(whereDatabase('/nowhere/netcheck.db')).toBe(join(tmpdir(), 'told-to.db'));
    });

    // Two entry points each picked their own place, and a site added in one was gone
    // in the other. Which reads as nothing being saved at all.
    it('lands in the same place wherever the program was started from', () =>
    {
        delete process.env.NETCHECK_DB;

        expect(whereDatabase('/one/netcheck.db')).toBe(whereDatabase('/another/netcheck.db'));
    });

    it('keeps using a database that is already sitting in the old place', () =>
    {
        delete process.env.NETCHECK_DB;

        const older = join(tmpdir(), `netcheck-older-${process.pid}.db`);

        writeFileSync(older, '');

        expect(whereDatabase(older)).toBe(older);

        rmSync(older, { force: true });
    });
});
