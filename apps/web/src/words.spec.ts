import { describe, expect, it } from 'vitest';
import { pickTongue, WORDS } from './words';
import type { Cause, Verdict } from './types';

const CAUSES: Cause[] =
[
    'none', 'never-checked', 'link', 'router', 'provider',
    'dns', 'sinkholed', 'filtered', 'handshake-cut', 'remote', 'unstable',
];

describe('pickTongue', () =>
{
    it('takes russian when the browser asks for it', () =>
    {
        expect(pickTongue(['ru-RU', 'en-US'])).toBe('ru');
    });

    it('takes russian however the tag is spelled', () =>
    {
        expect(pickTongue(['RU'])).toBe('ru');
        expect(pickTongue(['ru'])).toBe('ru');
    });

    // Second in the list still counts: a person listing two speaks both.
    it('takes russian even when it is not first', () =>
    {
        expect(pickTongue(['de-DE', 'ru-RU'])).toBe('ru');
    });

    it('falls back to english for anything else', () =>
    {
        expect(pickTongue(['fr-FR'])).toBe('en');
        expect(pickTongue([])).toBe('en');
    });
});

describe('the two tongues', () =>
{
    // A cause added to the verdict with no line to show for it would print nothing
    // at all, in whichever language the reader happens to have.
    it.each(CAUSES)('says something about %s in both', (cause) =>
    {
        expect(WORDS.en.said[cause].headline).toBeTruthy();
        expect(WORDS.ru.said[cause].headline).toBeTruthy();
    });

    it.each(CAUSES)('offers the same number of steps for %s in both', (cause) =>
    {
        expect(WORDS.ru.next[cause]).toHaveLength(WORDS.en.next[cause].length);
    });

    it('carries the same keys for the resolver answers', () =>
    {
        expect(Object.keys(WORDS.ru.dns).sort()).toEqual(Object.keys(WORDS.en.dns).sort());
    });

    it('names every link of the chain in both', () =>
    {
        expect(Object.keys(WORDS.ru.chain).sort()).toEqual(Object.keys(WORDS.en.chain).sort());
        expect(Object.values(WORDS.ru.chain).every((v) => v.length > 0)).toBe(true);
    });

    it('says the tunnel line in both without claiming what is inside', () =>
    {
        for (const tongue of [WORDS.en, WORDS.ru])
        {
            const line = tongue.throughTunnel('wg0');

            expect(line).toContain('wg0');
            expect(line.toLowerCase()).not.toContain('protected');
            expect(line.toLowerCase()).not.toContain('защищ');
        }
    });

    it('carries every word in both', () =>
    {
        expect(Object.keys(WORDS.ru).sort()).toEqual(Object.keys(WORDS.en).sort());
    });

    // The blamed names are joined by a word, and it is not the same word.
    it('joins the blamed names with its own conjunction', () =>
    {
        const verdict: Verdict = { level: 'warn', cause: 'remote', reachable: 1, total: 3,
            blame: ['A', 'B', 'C'] };

        expect(WORDS.en.said.remote.detail(verdict)).toContain('A, B and C');
        expect(WORDS.ru.said.remote.detail(verdict)).toContain('A, B и C');
    });
});
