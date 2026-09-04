import { describe, expect, it } from 'vitest';
import { makerOf, randomised } from './vendors.ts';

describe('makerOf', () =>
{
    it('names the maker from the first three bytes', () =>
    {
        expect(makerOf('74:da:88:12:34:56').vendor).toBe('TP-Link');
        expect(makerOf('8c:16:45:aa:bb:cc').vendor).toBe('Samsung');
    });

    it('reads an address written any of the ways it gets written', () =>
    {
        for (const written of ['74:da:88:12:34:56', '74-DA-88-12-34-56', '74da88123456'])
        {
            expect(makerOf(written).vendor).toBe('TP-Link');
        }
    });

    it('guesses what kind of thing it is from who made it', () =>
    {
        expect(makerOf('74:da:88:12:34:56').kind).toBe('router');
        expect(makerOf('8c:16:45:aa:bb:cc').kind).toBe('phone');
        expect(makerOf('4c:1d:96:aa:bb:cc').kind).toBe('computer');
        expect(makerOf('10:05:e7:aa:bb:cc').kind).toBe('console');
    });

    // A short list is honest about being short: an unknown maker says nothing rather
    // than guessing at one.
    it('says nothing about a maker it does not have', () =>
    {
        const maker = makerOf('01:23:45:67:89:ab');

        expect(maker.vendor).toBeNull();
        expect(maker.kind).toBe('unknown');
    });

    it('says nothing about an address too short to hold a maker', () =>
    {
        expect(makerOf('74:da').vendor).toBeNull();
        expect(makerOf('').vendor).toBeNull();
    });

    // Phones make up an address per network on purpose, so that the network cannot
    // recognise them twice. Reading a maker out of one would be reading noise.
    it('says a made-up address was made up rather than naming a maker', () =>
    {
        const maker = makerOf('76:da:88:12:34:56');

        expect(maker.randomised).toBe(true);
        expect(maker.vendor).toBeNull();
    });
});

describe('randomised', () =>
{
    it.each(['02', '06', '0A', '0E', '76', 'FE'])('knows %s as made up', (first) =>
    {
        expect(randomised(`${first}0000`)).toBe(true);
    });

    it.each(['00', '04', '74', '8C', '4C', 'FC'])('knows %s as handed out', (first) =>
    {
        expect(randomised(`${first}0000`)).toBe(false);
    });
});
