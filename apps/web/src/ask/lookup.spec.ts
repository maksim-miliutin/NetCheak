import { describe, expect, it } from 'vitest';
import { answerFor, countWhere, forget, type Found } from './lookup';

describe('forget', () =>
{
    // A target left marked as running has a button disabled until the page reloads.
    it('takes out the one asked about', () =>
    {
        const found: Found<string> = { 1: 'a', 2: 'running', 3: 'c' };

        expect(forget(found, 2)).toEqual({ 1: 'a', 3: 'c' });
    });

    it('leaves the one it was given alone', () =>
    {
        const found: Found<string> = { 1: 'a', 2: 'b' };

        forget(found, 1);

        expect(found).toEqual({ 1: 'a', 2: 'b' });
    });

    it('copes with an id nobody knows', () =>
    {
        expect(forget({ 1: 'a' } as Found<string>, 9)).toEqual({ 1: 'a' });
    });
});

describe('answerFor', () =>
{
    const found: Found<string> = { 1: 'answered', 2: 'running' };

    it('hands back a finished answer', () =>
    {
        expect(answerFor(found, 1)).toBe('answered');
    });

    // Waiting and never asked look the same on screen if they are not told apart.
    it('separates waiting from never asked', () =>
    {
        expect(answerFor(found, 2)).toBe('running');
        expect(answerFor(found, 3)).toBeNull();
    });
});

describe('countWhere', () =>
{
    const found: Found<{ helps: boolean }> =
    {
        1: { helps: true },
        2: { helps: false },
        3: 'running',
        4: { helps: true },
    };

    it('counts the answers that match', () =>
    {
        expect(countWhere(found, (one) => one.helps)).toBe(2);
    });

    // One still on its way is not an answer either way.
    it('leaves out the ones still running', () =>
    {
        expect(countWhere(found, () => true)).toBe(3);
    });

    it('counts nothing out of nothing', () =>
    {
        expect(countWhere({}, () => true)).toBe(0);
    });
});
