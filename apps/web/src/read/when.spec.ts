import { describe, expect, it } from 'vitest';
import { readStamp, showStamp } from './when';

describe('readStamp', () =>
{
    // The database writes Greenwich, so reading it as local time moves every check
    // by however far the reader is from London.
    it('reads the stored time as greenwich', () =>
    {
        expect(readStamp('2026-08-27 18:00:00')?.toISOString())
            .toBe('2026-08-27T18:00:00.000Z');
    });

    it('copes without the seconds', () =>
    {
        expect(readStamp('2026-08-27 18:00')?.toISOString())
            .toBe('2026-08-27T18:00:00.000Z');
    });

    it('copes with the letter between date and time', () =>
    {
        expect(readStamp('2026-08-27T18:00:00')?.toISOString())
            .toBe('2026-08-27T18:00:00.000Z');
    });

    it('says nothing about something that is not a time', () =>
    {
        expect(readStamp('never')).toBeNull();
        expect(readStamp('')).toBeNull();
    });
});

describe('showStamp', () =>
{
    // Day before month, as everything else written in Russian does it.
    it('writes the day first in russian', () =>
    {
        expect(showStamp('2026-08-27 18:00:00', 'ru')).toMatch(/^27\.08\.2026 /);
    });

    it('keeps the year first in english', () =>
    {
        expect(showStamp('2026-08-27 18:00:00', 'en')).toMatch(/^2026-08-27 /);
    });

    it('pads a single digit day and month', () =>
    {
        expect(showStamp('2026-01-05 09:07:00', 'ru')).toMatch(/^05\.01\.2026 /);
    });

    it('carries the clock through', () =>
    {
        expect(showStamp('2026-08-27 18:00:00', 'ru')).toMatch(/ \d{2}:\d{2}$/);
    });

    // Better a stamp nobody can read than a blank where a date should be.
    it('hands back what it was given when it cannot read it', () =>
    {
        expect(showStamp('not a time', 'ru')).toBe('not a time');
    });
});
