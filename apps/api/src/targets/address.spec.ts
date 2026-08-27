import { describe, expect, it } from 'vitest';
import { isAddress, looksLikeHost, parseTarget } from './address.ts';

function address(input: string)
{
    const parsed = parseTarget(input);

    return parsed.ok ? parsed.address : parsed.refusal;
}

describe('parseTarget', () =>
{
    it('takes a bare name and assumes the usual port', () =>
    {
        expect(address('example.com')).toEqual({ host: 'example.com', port: 443 });
    });

    // People paste what is in the address bar, scheme and path included.
    it('takes a whole address and keeps only the host', () =>
    {
        expect(address('https://example.com/news/today?a=1'))
            .toEqual({ host: 'example.com', port: 443 });
    });

    it('takes a port when one is given', () =>
    {
        expect(address('example.com:8443')).toEqual({ host: 'example.com', port: 8443 });
    });

    it('takes an address', () =>
    {
        expect(address('1.1.1.1')).toEqual({ host: '1.1.1.1', port: 443 });
    });

    it('lowercases the name and drops a trailing dot', () =>
    {
        expect(address('Example.COM.')).toEqual({ host: 'example.com', port: 443 });
    });

    it('trims what was pasted with spaces around it', () =>
    {
        expect(address('  example.com  ')).toEqual({ host: 'example.com', port: 443 });
    });

    it.each([['0'], ['65536'], ['-1'], ['80x'], ['']])('refuses port %s', (port) =>
    {
        expect(address(`example.com:${port}`)).toBe('bad-port');
    });

    it('refuses an empty box', () =>
    {
        expect(address('   ')).toBe('empty');
    });

    // A single word may resolve on a local network, but this tool asks the internet.
    it('refuses a name with no dot in it', () =>
    {
        expect(address('router')).toBe('bad-host');
    });

    it.each([['exa mple.com'], ['-example.com'], ['example-.com'], ['exa_mple.com']])(
        'refuses %s', (host) =>
        {
            expect(address(host)).toBe('bad-host');
        });

    // Digits and dots and nothing else is somebody typing an address, not a name.
    it('refuses an address with a part over 255', () =>
    {
        expect(address('1.1.1.256')).toBe('bad-host');
        expect(address('999.999.999.999')).toBe('bad-host');
    });

    it('takes an address of the sixth version', () =>
    {
        expect(address('2001:db8::1')).toEqual({ host: '2001:db8::1', port: 443 });
        expect(address('::1')).toEqual({ host: '::1', port: 443 });
    });

    // Written out with a port it is bracketed, and that is the only colon that splits.
    it('takes a bracketed address with a port', () =>
    {
        expect(address('[2001:db8::1]:8443')).toEqual({ host: '2001:db8::1', port: 8443 });
    });

    it('takes a bracketed address without a port', () =>
    {
        expect(address('[2001:db8::1]')).toEqual({ host: '2001:db8::1', port: 443 });
    });

    it('takes a pasted address of the sixth version', () =>
    {
        expect(address('https://[2001:db8::1]:8443/news'))
            .toEqual({ host: '2001:db8::1', port: 8443 });
    });

    it('refuses a name longer than a name may be', () =>
    {
        expect(address(`${'a'.repeat(250)}.com`)).toBe('too-long');
    });

    it('refuses a label longer than a label may be', () =>
    {
        expect(address(`${'a'.repeat(64)}.com`)).toBe('bad-host');
    });
});

describe('looksLikeHost', () =>
{
    it('accepts a name with several labels', () =>
    {
        expect(looksLikeHost('a.b.example.com')).toBe(true);
    });

    it('accepts digits inside a label', () =>
    {
        expect(looksLikeHost('s3.example.com')).toBe(true);
    });

    it('accepts a hyphen inside a label but not at its edges', () =>
    {
        expect(looksLikeHost('my-site.example.com')).toBe(true);
        expect(looksLikeHost('-site.example.com')).toBe(false);
    });

    it('refuses an empty label between two dots', () =>
    {
        expect(looksLikeHost('example..com')).toBe(false);
    });
});

describe('isAddress', () =>
{
    it.each([['1.1.1.1'], ['2001:db8::1'], ['::1'], ['::ffff:1.2.3.4']])(
        'reads %s as an address', (host) =>
        {
            expect(isAddress(host)).toBe(true);
        });

    it.each([['example.com'], ['1.1.1.256'], ['router'], ['']])(
        'does not read %s as an address', (host) =>
        {
            expect(isAddress(host)).toBe(false);
        });
});
