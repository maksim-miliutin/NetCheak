import { describe, expect, it } from 'vitest';
import { checkUpdate, isNewer, numbersIn } from './version.ts';

describe('isNewer', () =>
{
    // Compared as text, "1.10.0" comes before "1.9.0" and the tool tells people to
    // downgrade. This is the mistake worth a test of its own.
    it('reads ten as greater than nine', () =>
    {
        expect(isNewer('1.10.0', '1.9.0')).toBe(true);
        expect(isNewer('1.9.0', '1.10.0')).toBe(false);
    });

    it('says nothing is newer than itself', () =>
    {
        expect(isNewer('1.2.3', '1.2.3')).toBe(false);
    });

    it.each([
        ['2.0.0', '1.9.9'],
        ['1.3.0', '1.2.9'],
        ['1.2.4', '1.2.3'],
    ])('reads %s as newer than %s', (candidate, current) =>
    {
        expect(isNewer(candidate, current)).toBe(true);
    });

    it('ignores a v written in front', () =>
    {
        expect(isNewer('v1.3.0', '1.2.0')).toBe(true);
        expect(isNewer('1.3.0', 'v1.2.0')).toBe(true);
    });

    // A release marked as a preview is not ahead of the finished version of the same
    // numbers, and this treats them as equal rather than guessing.
    it('compares the numbers and leaves the suffix alone', () =>
    {
        expect(isNewer('1.2.3-beta', '1.2.3')).toBe(false);
        expect(isNewer('1.2.4-beta', '1.2.3')).toBe(true);
    });

    it('copes with a version written shorter', () =>
    {
        expect(isNewer('1.3', '1.2.9')).toBe(true);
        expect(isNewer('1.2', '1.2.0')).toBe(false);
    });

    it('treats something unreadable as no newer', () =>
    {
        expect(isNewer('latest', '1.2.3')).toBe(false);
    });
});

describe('numbersIn', () =>
{
    it('reads the parts as numbers', () =>
    {
        expect(numbersIn('1.10.3')).toEqual([1, 10, 3]);
    });

    it('drops what follows a dash', () =>
    {
        expect(numbersIn('1.2.3-rc.1')).toEqual([1, 2, 3]);
    });

    it('reads an unreadable part as nothing', () =>
    {
        expect(numbersIn('1.x.3')).toEqual([1, 0, 3]);
    });
});

describe('checkUpdate', () =>
{
    const answering = (body: unknown, ok = true, status = 200) =>
        async () => ({ ok, status, json: async () => body }) as unknown as Response;

    it('says so when a newer release exists', async () =>
    {
        const found = await checkUpdate('1.2.0', answering({ tag_name: 'v1.3.0' }));

        expect(found).toMatchObject({ latest: 'v1.3.0', behind: true, error: null });
    });

    it('stays quiet when this is the newest', async () =>
    {
        expect((await checkUpdate('1.3.0', answering({ tag_name: 'v1.3.0' }))).behind).toBe(false);
    });

    // An older release than the one running is not a reason to say anything.
    it('never asks somebody to go backwards', async () =>
    {
        expect((await checkUpdate('1.4.0', answering({ tag_name: 'v1.3.0' }))).behind).toBe(false);
    });

    it('reports a refusal rather than guessing', async () =>
    {
        const found = await checkUpdate('1.2.0', answering(null, false, 403));

        expect(found.error).toContain('403');
        expect(found.behind).toBe(false);
    });

    it('reports an answer with no version in it', async () =>
    {
        expect((await checkUpdate('1.2.0', answering({}))).error).toContain('No version');
    });

    // The network being down is the usual state of a machine running this tool.
    it('survives the ask failing outright', async () =>
    {
        const failing = async () => { throw new Error('nothing out there'); };

        expect((await checkUpdate('1.2.0', failing)).error).toBe('nothing out there');
    });
});
