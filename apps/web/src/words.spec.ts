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

    it('says every state of the sixth version in both', () =>
    {
        expect(Object.keys(WORDS.ru.sixth).sort()).toEqual(Object.keys(WORDS.en.sixth).sort());
        expect(Object.values(WORDS.ru.sixth).every((v) => v.length > 0)).toBe(true);
    });

    // Having no address of that family is ordinary and must not read as a fault.
    it('does not call a missing sixth version a problem', () =>
    {
        for (const tongue of [WORDS.en, WORDS.ru])
        {
            expect(tongue.sixth.absent.toLowerCase()).toMatch(/ordinary|обычное/);
        }
    });

    // Nothing updates on its own, and the wording must not suggest otherwise.
    it('never promises to update itself', () =>
    {
        for (const tongue of [WORDS.en, WORDS.ru])
        {
            const line = tongue.newerExists('1.3.0').toLowerCase();

            expect(line).toMatch(/nothing updates on its own|само ничего не обновляется/);
        }
    });

    // The proxy relays bytes blind, and the wording must not suggest it sees more.
    it('says plainly that the proxy reads nothing', () =>
    {
        for (const tongue of [WORDS.en, WORDS.ru])
        {
            expect(tongue.proxyBlind.toLowerCase())
                .toMatch(/without reading|без чтения/);
            expect(tongue.proxyBlind.toLowerCase())
                .toMatch(/no key|ключа/);
        }
    });

    // The sentence sits above a table of what each way did, and must not name a way
    // the table may contradict.
    it('does not name a particular way in the sentence above the table', () =>
    {
        for (const tongue of [WORDS.en, WORDS.ru])
        {
            const line = tongue.evasion.helps.toLowerCase();

            expect(line).not.toMatch(/through the name|по имени/);
        }
    });

    it('names every outcome of a way in both', () =>
    {
        expect(Object.keys(WORDS.ru.answerNames).sort())
            .toEqual(Object.keys(WORDS.en.answerNames).sort());
        expect(Object.keys(WORDS.ru.wayNames).sort())
            .toEqual(Object.keys(WORDS.en.wayNames).sort());
    });

    // A preset is named the same in both, the way a product's modes are: what the
    // name means is in the sentence beside it, which is what gets translated.
    it('names each preset identically in both', () =>
    {
        expect(WORDS.ru.presetNames).toEqual(WORDS.en.presetNames);
    });

    // Short is the whole point: a name that runs to a sentence is the sentence.
    it('keeps every preset name short', () =>
    {
        for (const name of Object.values(WORDS.en.presetNames))
        {
            expect(name.length).toBeLessThan(12);
        }
    });

    it('says what each preset does, in both', () =>
    {
        for (const id of Object.keys(WORDS.en.presetNames))
        {
            expect(WORDS.en.presetSays[id]?.length ?? 0).toBeGreaterThan(30);
            expect(WORDS.ru.presetSays[id]?.length ?? 0).toBeGreaterThan(30);
        }
    });

    // Opening it to the network is a thing with a cost, and the wording must name it
    // rather than describe a convenience.
    it('warns what listening on the network means, in both', () =>
    {
        for (const tongue of [WORDS.en, WORDS.ru])
        {
            expect(tongue.phoneWarn.toLowerCase())
                .toMatch(/anybody else|любой в этой сети/);
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
