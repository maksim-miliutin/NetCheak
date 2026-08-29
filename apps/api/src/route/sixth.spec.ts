import { describe, expect, it } from 'vitest';
import { globalSixes, isGlobal, stateOf } from './sixth.ts';

describe('isGlobal', () =>
{
    it.each([['2001:db8::1'], ['2606:4700:4700::1111'], ['2a00:1450::1']])(
        'reads %s as an address that leads out', (address) =>
        {
            expect(isGlobal(address)).toBe(true);
        });

    // Link-local addresses sit on every interface whether the family is carried or
    // not, so counting them would say the sixth version works on every machine alive.
    it.each([['fe80::1'], ['fea0::1'], ['febf::1'], ['fe80::1%eth0']])(
        'leaves the link-local %s out', (address) =>
        {
            expect(isGlobal(address)).toBe(false);
        });

    // Unique-local addresses go no further than the house.
    it.each([['fc00::1'], ['fd12:3456::1']])('leaves the house-only %s out', (address) =>
    {
        expect(isGlobal(address)).toBe(false);
    });

    it('leaves this machine out', () =>
    {
        expect(isGlobal('::1')).toBe(false);
    });
});

describe('stateOf', () =>
{
    it('says absent when the machine holds no address that leads out', () =>
    {
        expect(stateOf([], null)).toBe('absent');
        expect(stateOf([], 'answered')).toBe('absent');
    });

    // The worst case: an address the machine will try and cannot use.
    it('calls it broken when the address leads nowhere', () =>
    {
        expect(stateOf(['2001:db8::1'], 'silent')).toBe('broken');
    });

    // A refusal is an answer: something out there received the packet and replied.
    it.each([['answered'], ['refused']] as const)('calls a %s reply working', (answer) =>
    {
        expect(stateOf(['2001:db8::1'], answer)).toBe('working');
    });

    it('says so when the address was found but nothing was tried', () =>
    {
        expect(stateOf(['2001:db8::1'], null)).toBe('link-local-only');
    });
});

describe('globalSixes', () =>
{
    // The machine running the tests has whatever it has; the promise is the shape.
    it('hands back only addresses that lead out', () =>
    {
        expect(globalSixes().every((address) => isGlobal(address))).toBe(true);
    });
});
