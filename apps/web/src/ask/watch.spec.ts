import { describe, expect, it } from 'vitest';
import { EVERY_MS, isDue, nextInSeconds, type WatchState } from './watch';

function state(over: Partial<WatchState> = {}): WatchState
{
    return { sinceMs: EVERY_MS, busy: false, hidden: false, enabled: true, ...over };
}

describe('isDue', () =>
{
    it('runs at once when nothing has run yet', () =>
    {
        expect(isDue(state({ sinceMs: null }))).toBe(true);
    });

    it('waits until the interval has passed', () =>
    {
        expect(isDue(state({ sinceMs: EVERY_MS - 1 }))).toBe(false);
        expect(isDue(state({ sinceMs: EVERY_MS }))).toBe(true);
    });

    // Starting a second check over a running one would measure the first one's traffic.
    it('never starts one over another', () =>
    {
        expect(isDue(state({ busy: true }))).toBe(false);
        expect(isDue(state({ busy: true, sinceMs: null }))).toBe(false);
    });

    // A hidden tab measures the machine sleeping, and its timers are throttled anyway.
    it('stays quiet while the tab is hidden', () =>
    {
        expect(isDue(state({ hidden: true }))).toBe(false);
        expect(isDue(state({ hidden: true, sinceMs: null }))).toBe(false);
    });

    it('stays quiet when switched off', () =>
    {
        expect(isDue(state({ enabled: false, sinceMs: null }))).toBe(false);
    });

    it('takes a custom interval', () =>
    {
        expect(isDue(state({ sinceMs: 5000 }), 10_000)).toBe(false);
        expect(isDue(state({ sinceMs: 10_000 }), 10_000)).toBe(true);
    });
});

describe('nextInSeconds', () =>
{
    it('says now when nothing has run', () =>
    {
        expect(nextInSeconds(null)).toBe(0);
    });

    it('counts down to the next run', () =>
    {
        expect(nextInSeconds(EVERY_MS - 30_000)).toBe(30);
    });

    it('never counts below zero', () =>
    {
        expect(nextInSeconds(EVERY_MS * 3)).toBe(0);
    });
});
