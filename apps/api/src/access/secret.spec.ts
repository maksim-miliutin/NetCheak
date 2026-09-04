import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carriesKey, networkKey } from './secret.ts';

const made: string[] = [];

function corner(): string
{
    const dir = mkdtempSync(join(tmpdir(), 'secret-'));

    made.push(dir);

    return join(dir, 'netcheck.db');
}

afterEach(() =>
{
    for (const dir of made.splice(0))
    {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe('networkKey', () =>
{
    it('makes a word the first time and keeps it after', () =>
    {
        const beside = corner();

        const first = networkKey(beside).word;
        const second = networkKey(beside).word;

        expect(first).toBe(second);
        expect(first.length).toBeGreaterThan(8);
    });

    // The database is the one thing that might be shown to somebody, and a password
    // kept inside it is a password given away.
    it('sits beside the database, not in it', () =>
    {
        const beside = corner();
        const { file } = networkKey(beside);

        expect(file).not.toBe(beside);
        expect(readFileSync(file, 'utf8').trim()).toBe(networkKey(beside).word);
    });

    it('makes different words in different places', () =>
    {
        expect(networkKey(corner()).word).not.toBe(networkKey(corner()).word);
    });
});

describe('carriesKey', () =>
{
    const word = 'abc123';
    const header = 'Basic ' + Buffer.from('phone:' + word).toString('base64');

    it('lets the word through, in the header a browser already sends', () =>
    {
        expect(carriesKey(header, word)).toBe(true);
    });

    it('refuses the wrong word', () =>
    {
        const wrong = 'Basic ' + Buffer.from('phone:nope').toString('base64');

        expect(carriesKey(wrong, word)).toBe(false);
    });

    it('refuses a request that carried nothing', () =>
    {
        expect(carriesKey(undefined, word)).toBe(false);
        expect(carriesKey('', word)).toBe(false);
    });

    it('refuses a header of a kind it does not speak', () =>
    {
        expect(carriesKey('Bearer ' + word, word)).toBe(false);
    });
});
