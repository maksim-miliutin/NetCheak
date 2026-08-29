import { describe, expect, it } from 'vitest';
import { blame } from './cut.ts';

describe('blame', () =>
{
    it('says nothing is wrong when the named handshake completes', () =>
    {
        expect(blame('completed', 'completed')).toBe('open');
        expect(blame('completed', 'reset')).toBe('open');
    });

    // The packets, the address and the port are identical either way. The only
    // difference is that one of them says which site is wanted.
    it('blames a reader of the name when only the named attempt dies', () =>
    {
        expect(blame('reset', 'completed')).toBe('name-read');
    });

    // Both dying says the objection is to the address, not to what was asked of it.
    it('blames the address when both attempts die the same way', () =>
    {
        expect(blame('reset', 'reset')).toBe('address-blocked');
    });

    it.each([
        ['timeout', 'completed'],
        ['rejected', 'reset'],
        ['refused', 'timeout'],
    ] as const)('admits it cannot tell from %s and %s', (named, unnamed) =>
    {
        expect(blame(named, unnamed)).toBe('unclear');
    });
});
