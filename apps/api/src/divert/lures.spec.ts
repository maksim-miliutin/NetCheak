import { describe, expect, it } from 'vitest';
import { isLure, LURES, lureNames } from './lures.ts';

describe('lures', () =>
{
    it('offers more than one, so a copy that fails has somewhere to go', () =>
    {
        expect(LURES.length).toBeGreaterThan(3);
    });

    it('gives every name a reason, so the list can be argued with', () =>
    {
        for (const one of LURES)
        {
            expect(one.because.length).toBeGreaterThan(10);
        }
    });

    // Two copies carrying the same name are one lure tried twice.
    it('names nothing twice', () =>
    {
        expect(new Set(lureNames()).size).toBe(LURES.length);
    });

    it('carries names a host could actually have', () =>
    {
        for (const name of lureNames())
        {
            expect(name).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
        }
    });

    // A copy carrying one of these is one this program made, and that is how it
    // avoids making copies of its own copies.
    it('knows its own names and nobody else\u2019s', () =>
    {
        expect(isLure(lureNames()[0] ?? '')).toBe(true);
        expect(isLure('discord.com')).toBe(false);
        expect(isLure('')).toBe(false);
    });
});
