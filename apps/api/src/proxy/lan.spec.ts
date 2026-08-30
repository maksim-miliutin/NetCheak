import { describe, expect, it } from 'vitest';
import { isPrivate, lanAddress } from './lan.ts';

describe('isPrivate', () =>
{
    it.each([['10.0.0.5'], ['192.168.1.42'], ['172.16.0.1'], ['172.31.255.254']])(
        'reads %s as inside a home network', (address) =>
        {
            expect(isPrivate(address)).toBe(true);
        });

    // A public address would mean the proxy is open to the whole internet rather than
    // to the flat, and nobody should be handed that by a tool that found it for them.
    it.each([['8.8.8.8'], ['1.1.1.1'], ['93.184.216.34']])(
        'refuses the public address %s', (address) =>
        {
            expect(isPrivate(address)).toBe(false);
        });

    // The range stops at 172.31, and 172.32 belongs to somebody else.
    it('knows where the middle range ends', () =>
    {
        expect(isPrivate('172.15.0.1')).toBe(false);
        expect(isPrivate('172.32.0.1')).toBe(false);
    });
});

describe('lanAddress', () =>
{
    it('hands back an address inside a home network, or nothing', () =>
    {
        const found = lanAddress();

        expect(found === null || isPrivate(found)).toBe(true);
    });
});
