import { describe, expect, it } from 'vitest';
import { reasonFor } from './missing.ts';

describe('reasonFor', () =>
{
    it('names the utility that is not there', () =>
    {
        expect(reasonFor({ code: 'ENOENT' }, 'traceroute'))
            .toBe('The system traceroute is not installed');
    });

    it('names the utility that took too long', () =>
    {
        expect(reasonFor({ code: 'ETIMEDOUT' }, 'ping')).toContain('ping took too long');
    });

    // Anything else is the utility's own words, which say more than a rewording would.
    it('passes anything else along as it came', () =>
    {
        expect(reasonFor(new Error('something else'), 'ping')).toBe('something else');
    });

    it('copes with an error carrying no code at all', () =>
    {
        expect(reasonFor(new Error('bare'), 'arp')).toBe('bare');
    });
});
