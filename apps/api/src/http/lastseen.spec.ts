import { describe, expect, it } from 'vitest';
import { LastSeen } from './lastseen.ts';

/** A clock the test moves by hand, since waiting a minute proves nothing. */
function ticking(): { now: () => number; pass: (ms: number) => void }
{
    let at = 1000;

    return { now: () => at, pass: (ms) => { at += ms; } };
}

describe('LastSeen', () =>
{
    it('starts with nothing found', () =>
    {
        const seen = new LastSeen();

        expect(seen.get('dns')).toBeNull();
        expect(seen.get('tls')).toEqual([]);
        expect(seen.ageOf('dns')).toBeNull();
    });

    it('hands back what was put in', () =>
    {
        const seen = new LastSeen();
        const sixth = { state: 'working' as const, addresses: ['2001:db8::1'],
            answer: 'answered' as const, ms: 12 };

        seen.put('sixth', sixth);

        expect(seen.get('sixth')).toBe(sixth);
    });

    it('counts how long ago each was found', () =>
    {
        const clock = ticking();
        const seen = new LastSeen(clock.now);

        seen.put('neighbours', 4);
        clock.pass(5000);

        expect(seen.ageOf('neighbours')).toBe(5000);
    });

    it('forgets the old age when something is found again', () =>
    {
        const clock = ticking();
        const seen = new LastSeen(clock.now);

        seen.put('neighbours', 4);
        clock.pass(9000);
        seen.put('neighbours', 5);

        expect(seen.ageOf('neighbours')).toBe(0);
    });

    // A report that mixes minutes should be able to say so.
    it('names the age of the oldest thing it still reports', () =>
    {
        const clock = ticking();
        const seen = new LastSeen(clock.now);

        seen.put('rings', { gateway: null, resolvers: [] });
        clock.pass(60_000);
        seen.put('neighbours', 2);

        expect(seen.oldestMs()).toBe(60_000);
    });

    it('says nothing about the oldest when nothing was found', () =>
    {
        expect(new LastSeen().oldestMs()).toBeNull();
    });

    it('hands over everything at once for a report', () =>
    {
        const seen = new LastSeen();

        seen.put('neighbours', 3);

        expect(seen.all()).toMatchObject({ neighbours: 3, dns: null, tls: [] });
    });

    // Handing out the store itself would let a caller change it from the outside.
    it('hands over a copy rather than the store', () =>
    {
        const seen = new LastSeen();
        const taken = seen.all();

        taken.neighbours = 99;

        expect(seen.get('neighbours')).toBeNull();
    });
});
