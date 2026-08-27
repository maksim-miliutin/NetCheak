import { describe, expect, it } from 'vitest';
import { compare, looksSinkholed, type Lookup } from './resolve.ts';

const answered = (server: string, addresses: string[]): Lookup =>
    ({ server, addresses, ms: 12, error: null });

const failed = (server: string, error = 'ETIMEOUT'): Lookup =>
    ({ server, addresses: [], ms: null, error });

describe('compare', () =>
{
    it('says nothing when the system resolver is unknown', () =>
    {
        expect(compare(null, answered('1.1.1.1', ['93.184.216.34']))).toBe('unknown');
    });

    it('calls it agreement when the two share an address', () =>
    {
        const system = answered('192.168.1.1', ['93.184.216.34', '93.184.216.35']);
        const reference = answered('1.1.1.1', ['93.184.216.34']);

        expect(compare(system, reference)).toBe('agree');
    });

    // A content network hands out the nearest edge, so two resolvers in different
    // places disagree on a perfectly healthy name. The difference is a hint, not proof.
    it('calls it a difference when neither routable address matches', () =>
    {
        const system = answered('192.168.1.1', ['104.20.23.154']);
        const reference = answered('1.1.1.1', ['93.184.216.34']);

        expect(compare(system, reference)).toBe('differ');
    });

    // An address nobody can route to did not come from the site.
    it('calls out an answer that points nowhere', () =>
    {
        const system = answered('192.168.1.1', ['10.10.10.10']);
        const reference = answered('1.1.1.1', ['93.184.216.34']);

        expect(compare(system, reference)).toBe('sinkholed');
    });

    it('blames the system resolver when only it fails', () =>
    {
        expect(compare(failed('192.168.1.1'), answered('1.1.1.1', ['93.184.216.34'])))
            .toBe('system-fails');
    });

    it('blames the reference when only it fails', () =>
    {
        expect(compare(answered('192.168.1.1', ['93.184.216.34']), failed('1.1.1.1')))
            .toBe('public-fails');
    });

    it('says both failed when neither answered', () =>
    {
        expect(compare(failed('192.168.1.1'), failed('1.1.1.1'))).toBe('both-fail');
    });

    it('does not call it sinkholed when the answer merely differs', () =>
    {
        const system = answered('192.168.1.1', ['104.20.23.154', '10.10.10.10']);
        const reference = answered('1.1.1.1', ['93.184.216.34']);

        expect(compare(system, reference)).toBe('differ');
    });

    // An empty answer is a failure to resolve, whatever the absence of an error says.
    it('treats an empty answer as a failure', () =>
    {
        const empty: Lookup = { server: '192.168.1.1', addresses: [], ms: 5, error: null };

        expect(compare(empty, answered('1.1.1.1', ['93.184.216.34']))).toBe('system-fails');
    });
});

describe('looksSinkholed', () =>
{
    it.each([['0.0.0.0'], ['10.1.2.3'], ['127.0.0.1'], ['192.168.0.1'], ['172.20.1.1']])(
        'reads %s as an address nobody can route to', (address) =>
        {
            expect(looksSinkholed([address])).toBe(true);
        });

    it.each([['::'], ['::1'], ['fd00::1'], ['fc00::5'], ['fe80::1']])(
        'reads %s as an address nobody can route to', (address) =>
        {
            expect(looksSinkholed([address])).toBe(true);
        });

    // The link-local range is fe80::/10, so it runs to febf and fea0 sits inside it.
    it('reads every part of the link-local range', () =>
    {
        expect(looksSinkholed(['fe80::1'])).toBe(true);
        expect(looksSinkholed(['fea0::1'])).toBe(true);
        expect(looksSinkholed(['febf::1'])).toBe(true);
        expect(looksSinkholed(['fec0::1'])).toBe(false);
    });

    it.each([['2001:db8::1'], ['2606:4700::1111']])(
        'leaves %s alone', (address) =>
        {
            expect(looksSinkholed([address])).toBe(false);
        });

    it.each([['93.184.216.34'], ['1.1.1.1'], ['172.15.0.1'], ['172.32.0.1']])(
        'leaves %s alone', (address) =>
        {
            expect(looksSinkholed([address])).toBe(false);
        });

    it('says nothing about an empty answer', () =>
    {
        expect(looksSinkholed([])).toBe(false);
    });
});
