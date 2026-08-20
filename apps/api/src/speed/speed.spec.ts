import { describe, expect, it } from 'vitest';
import { DEFAULTS, share, summarise, type Transfer } from './speed';

function stream(chunks: [number, number][], elapsedMs: number): Transfer
{
    return { chunks: chunks.map(([at, bytes]) => ({ at, bytes })), elapsedMs };
}

describe('summarise', () =>
{
    it('says nothing when no stream ran', () =>
    {
        expect(summarise([], 0)).toBeNull();
    });

    // One megabyte in one second is eight megabits per second, by definition.
    it('turns bytes and seconds into megabits', () =>
    {
        const rate = summarise([stream([[0, 1_000_000]], 1000)], 0);

        expect(rate?.megabits).toBe(8);
        expect(rate?.seconds).toBe(1);
    });

    // TCP spends its first moments growing the window; counting that ramp reports a
    // number the user never sees again.
    it('drops everything that arrived during the warmup', () =>
    {
        const rate = summarise([stream([[500, 9_000_000], [2000, 1_000_000]], 3000)], 1000);

        expect(rate?.bytes).toBe(1_000_000);
        expect(rate?.seconds).toBe(2);
    });

    it('adds the streams together but does not add their time', () =>
    {
        const rate = summarise(
        [
            stream([[0, 1_000_000]], 1000),
            stream([[0, 1_000_000]], 1000),
        ], 0);

        expect(rate?.bytes).toBe(2_000_000);
        expect(rate?.seconds).toBe(1);
        expect(rate?.megabits).toBe(16);
        expect(rate?.streams).toBe(2);
    });

    // A stream that finishes early must not shorten the window for the rest.
    it('measures over the longest stream', () =>
    {
        const rate = summarise(
        [
            stream([[0, 1_000_000]], 1000),
            stream([[0, 1_000_000]], 4000),
        ], 0);

        expect(rate?.seconds).toBe(4);
    });

    it('says nothing when the warmup swallowed the whole run', () =>
    {
        expect(summarise([stream([[100, 5_000_000]], 900)], 1200)).toBeNull();
    });

    it('says nothing when nothing moved', () =>
    {
        expect(summarise([stream([], 3000)], 1000)).toBeNull();
    });
});

describe('share', () =>
{
    it('splits evenly when it can', () =>
    {
        expect(share(1000, 4)).toEqual([250, 250, 250, 250]);
    });

    it('gives the remainder to the last stream', () =>
    {
        expect(share(1002, 4)).toEqual([250, 250, 250, 252]);
    });

    it('returns nothing for no streams', () =>
    {
        expect(share(1000, 0)).toEqual([]);
    });
});

describe('defaults', () =>
{
    it('warms up for less than it measures', () =>
    {
        expect(DEFAULTS.warmupMs).toBeLessThan(DEFAULTS.durationMs);
    });
});