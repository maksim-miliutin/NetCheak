import { describe, expect, it } from 'vitest';
import { marks, whatWorks } from './working.ts';
import type { Evasion } from '../types';

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
