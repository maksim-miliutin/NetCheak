import { describe, expect, it } from 'vitest';
import { readReply } from './evasion.ts';

describe('readReply', () =>
{
    it('reads a handshake record as a greeting', () =>
    {
        expect(readReply(0x16)).toBe('greeted');
    });

    // A complaint is still an answer: the packet arrived and was read.
    it('reads an alert as a complaint rather than silence', () =>
    {
        expect(readReply(0x15)).toBe('complained');
    });

    it('reads nothing at all as silence', () =>
    {
        expect(readReply(undefined)).toBe('silent');
    });

    it('reads anything unexpected as silence', () =>
    {
        expect(readReply(0x99)).toBe('silent');
    });
});
