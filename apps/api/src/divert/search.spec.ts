import { describe, expect, it } from 'vitest';
import { candidates, findSettings, type Trying } from './search.ts';
import type { Settings } from './runner.ts';

/** A machine that never was: it answers when asked, and remembers what was done. */
function machine(answersAfter: number | 'never', hello: string | null = 'hello.bin')
{
    const started: Settings[] = [];

    let asked = 0;
    let stopped = 0;

    const trying: Trying =
    {
        candidates: candidates(hello, null),
        start: async (settings) => void started.push(settings),
        stop: async () => void (stopped += 1),
        settle: async () => undefined,
        answers: async () =>
        {
            asked += 1;

            return answersAfter !== 'never' && asked > answersAfter;
        },
    };

    return { trying, started, stopped: () => stopped, asked: () => asked };
}

describe('candidates', () =>
{
    it('offers the mildest thing first', () =>
    {
        expect(candidates(null, null)[0]).toMatchObject({ fooling: 'ttl', ttl: 6 });
    });

    it('carries the recordings into every one of them', () =>
    {
        for (const one of candidates('hello.bin', 'voice.bin'))
        {
            expect(one.hello).toBe('hello.bin');
            expect(one.voice).toBe('voice.bin');
        }
    });

    it('carries the sites it is for into every one of them', () =>
    {
        for (const one of candidates(null, null, ['discord.com']))
        {
            expect(one.only).toEqual(['discord.com']);
        }
    });

    it('offers no two that are the same', () =>
    {
        const said = candidates(null, null).map((one) =>
            `${one.fooling}:${one.ttl}:${one.repeats}:${one.decoyName ?? ''}`);

        expect(new Set(said).size).toBe(said.length);
    });

    // Which name a copy carries decides whether a filter objects to it, and that is
    // worth trying more than one of.
    it('tries every name when there is no recording to carry one', () =>
    {
        const names = new Set(candidates(null, null).map((one) => one.decoyName));

        expect(names.size).toBeGreaterThan(3);
    });

    // A recorded hello carries the name of whoever was recorded. There is nothing
    // to vary, and pretending otherwise would run the same attempt six times.
    it('varies nothing about the name when a recording carries it', () =>
    {
        const tried = candidates('bin/hello.bin', null);

        expect(tried).toHaveLength(8);
        expect(tried.every((one) => one.decoyName === undefined)).toBe(true);
    });
});

describe('findSettings', () =>
{
    // Cutting packets for a site that opens on its own is all cost and no help.
    it('does nothing at all when the site already answers', async () =>
    {
        const fake = machine(0);
        const found = await findSettings(fake.trying);

        expect(found.already).toBe(true);
        expect(found.settings).toBeNull();
        expect(fake.started).toHaveLength(0);
    });

    it('keeps the first settings that got an answer', async () =>
    {
        // Asked once before anything is tried, then once after each attempt.
        const fake = machine(3);
        const found = await findSettings(fake.trying);

        expect(found.already).toBe(false);
        expect(found.settings).toEqual(fake.trying.candidates[2]);
        expect(fake.started).toHaveLength(3);
    });

    it('leaves the settings that worked running rather than stopping them', async () =>
    {
        const fake = machine(1);

        await findSettings(fake.trying);

        expect(fake.stopped()).toBe(0);
    });

    it('says what it tried and how each one went', async () =>
    {
        const found = await findSettings(machine(2).trying);

        expect(found.tried).toHaveLength(2);
        expect(found.tried.map((one) => one.worked)).toEqual([false, true]);
    });

    it('stops when nothing worked rather than leaving the last one on', async () =>
    {
        const fake = machine('never');
        const found = await findSettings(fake.trying);

        expect(found.settings).toBeNull();
        expect(found.tried).toHaveLength(fake.trying.candidates.length);
        expect(fake.stopped()).toBe(1);
    });

    it('tries them in the order they were offered', async () =>
    {
        const fake = machine('never');

        await findSettings(fake.trying);

        expect(fake.started).toEqual(fake.trying.candidates);
    });
});
