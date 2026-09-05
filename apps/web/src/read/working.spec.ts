import { describe, expect, it } from 'vitest';
import { marks, presetFor, whatWorks } from './working.ts';
import type { Evasion, Preset } from '../types';

function answered(pairs: [string, string][], error: string | null = null): Evasion
{
    return {
        host: 'blocked.example',
        whole: 'reset',
        split: 'greeted',
        splittingHelps: true,
        tried: pairs.map(([way, answer]) => ({ way, answer })) as Evasion['tried'],
        works: null,
        error,
    };
}

describe('whatWorks', () =>
{
    it('counts a way once for every site it got through', () =>
    {
        const working = whatWorks([
            answered([['name', 'greeted'], ['tiny', 'reset']]),
            answered([['name', 'greeted'], ['tiny', 'greeted']]),
        ]);

        expect(marks(working, 'name')).toBe(2);
        expect(marks(working, 'tiny')).toBe(1);
        expect(working.checked).toBe(2);
    });

    it('counts nothing for a way nobody got through with', () =>
    {
        const working = whatWorks([answered([['name', 'reset']])]);

        expect(marks(working, 'name')).toBe(0);
        expect(marks(working, 'both')).toBe(0);
    });

    // A check still running has not said anything. Treating it as a failure would
    // mark a way useless for as long as it takes to find out otherwise.
    it('reads nothing into a check that is still running', () =>
    {
        const working = whatWorks(['running', null]);

        expect(working.checked).toBe(0);
        expect(working.ways.size).toBe(0);
    });

    it('leaves out a check that failed rather than answered', () =>
    {
        const working = whatWorks([
            answered([['name', 'greeted']], 'could not reach it'),
        ]);

        expect(working.checked).toBe(0);
        expect(marks(working, 'name')).toBe(0);
    });

    it('answers plainly when nothing has been checked', () =>
    {
        const working = whatWorks([]);

        expect(working.checked).toBe(0);
        expect(marks(working, 'name')).toBe(0);
    });
});

describe('presetFor', () =>
{
    const presets = [
        { id: 'lite-1', way: 'name', overHttps: false, gapMs: 30 },
        { id: 'shred-2', way: 'tiny', overHttps: true, gapMs: 25 },
        { id: 'records-1', way: 'records', overHttps: true, gapMs: 40 },
        { id: 'records-3', way: 'records', overHttps: true, gapMs: 120 },
    ] as Preset[];

    it('finds the preset that writes a hello this way', () =>
    {
        expect(presetFor('tiny', presets)).toBe('shred-2');
    });

    // The presets are already ordered by what they cost, so the first one that
    // writes this way is the cheapest way of getting it.
    it('takes the lightest when more than one writes it', () =>
    {
        expect(presetFor('records', presets)).toBe('records-1');
    });

    // Nothing rather than an empty string: an empty string is what the button used
    // to pass, and it means every way at once.
    it('answers nothing when no preset writes it', () =>
    {
        expect(presetFor('both', presets)).toBeUndefined();
    });
});
