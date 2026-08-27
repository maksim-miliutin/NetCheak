import { describe, expect, it } from 'vitest';
import type { PeerCertificate } from 'node:tls';
import { certificateNames, matchesHost, readHandshake } from './handshake.ts';

function certificate(common: string | undefined, alternates?: string): PeerCertificate
{
    return {
        subject: common === undefined ? {} : { CN: common },
        subjectaltname: alternates,
    } as unknown as PeerCertificate;
}

describe('readHandshake', () =>
{
    // Refused means nothing was listening. Reset means something answered and then
    // cut the conversation, which is a different accusation entirely.
    it('separates a connection cut from one never accepted', () =>
    {
        expect(readHandshake('ECONNRESET')).toBe('reset');
        expect(readHandshake('ECONNREFUSED')).toBe('refused');
    });

    it('reads both spellings of a timeout', () =>
    {
        expect(readHandshake('ETIMEDOUT')).toBe('timeout');
        expect(readHandshake('ERR_SOCKET_CONNECTION_TIMEOUT')).toBe('timeout');
    });

    it('leaves anything else as a rejection', () =>
    {
        expect(readHandshake('ERR_TLS_CERT_ALTNAME_INVALID')).toBe('rejected');
        expect(readHandshake(undefined)).toBe('rejected');
    });
});

describe('certificateNames', () =>
{
    it('takes the common name when there are no alternates', () =>
    {
        expect(certificateNames(certificate('example.com'))).toEqual(['example.com']);
    });

    it('strips the DNS prefix off the alternates', () =>
    {
        const alternates = 'DNS:example.com, DNS:*.example.com';
        const names = certificateNames(certificate('example.com', alternates));

        expect(names).toEqual(['example.com', '*.example.com']);
    });

    it('does not repeat a name that appears twice', () =>
    {
        expect(certificateNames(certificate('a.test', 'DNS:a.test'))).toEqual(['a.test']);
    });

    // Node hands back an array when a certificate carries several common names.
    it('takes every common name when there is more than one', () =>
    {
        const several = { subject: { CN: ['a.test', 'b.test'] } } as unknown as PeerCertificate;

        expect(certificateNames(several)).toEqual(['a.test', 'b.test']);
    });

    it('copes with a certificate that names nothing', () =>
    {
        expect(certificateNames(certificate(undefined))).toEqual([]);
    });
});

describe('matchesHost', () =>
{
    it('matches a name spelled out in full', () =>
    {
        expect(matchesHost('example.com', ['example.com'])).toBe(true);
    });

    it('ignores the case of either side', () =>
    {
        expect(matchesHost('Example.COM', ['example.com'])).toBe(true);
    });

    // A wildcard covers one label, and only the leftmost one.
    it('matches one label under a wildcard', () =>
    {
        expect(matchesHost('www.example.com', ['*.example.com'])).toBe(true);
    });

    it('does not let a wildcard reach two labels down', () =>
    {
        expect(matchesHost('a.b.example.com', ['*.example.com'])).toBe(false);
    });

    // The bare domain is not covered by a wildcard for its subdomains.
    it('does not let a wildcard cover the domain itself', () =>
    {
        expect(matchesHost('example.com', ['*.example.com'])).toBe(false);
    });

    it('refuses a name that merely ends the same way', () =>
    {
        expect(matchesHost('notexample.com', ['example.com'])).toBe(false);
        expect(matchesHost('evil-example.com', ['*.example.com'])).toBe(false);
    });

    it('accepts a match anywhere in the list', () =>
    {
        expect(matchesHost('mail.example.com', ['example.com', '*.example.com'])).toBe(true);
    });

    it('refuses everything when the certificate names nothing', () =>
    {
        expect(matchesHost('example.com', [])).toBe(false);
    });
});
