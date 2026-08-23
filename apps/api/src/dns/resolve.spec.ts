import { describe, expect, it } from 'vitest';
import { compare, type Lookup } from './resolve.ts';

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

    // The interesting case: the lookup works and still returns somebody else's address.
    it('calls it a difference when neither address matches', () =>
    {
        const system = answered('192.168.1.1', ['10.10.10.10']);
        const reference = answered('1.1.1.1', ['93.184.216.34']);

        expect(compare(system, reference)).toBe('differ');
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

    // An empty answer is a failure to resolve, whatever the absence of an error says.
    it('treats an empty answer as a failure', () =>
    {
        const empty: Lookup = { server: '192.168.1.1', addresses: [], ms: 5, error: null };

        expect(compare(empty, answered('1.1.1.1', ['93.184.216.34']))).toBe('system-fails');
    });
});
