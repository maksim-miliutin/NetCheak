import { describe, expect, it } from 'vitest';
import { buildPac, clean } from './pac.ts';

/** Runs the generated file the way a browser would, and asks it about a host. */
function ask(pac: string, host: string): string
{
    const run = new Function(`${pac}; return FindProxyForURL;`) as () =>
        (url: string, host: string) => string;

    return run()(`https://${host}/`, host);
}

describe('clean', () =>
{
    it('takes a bare name as it is', () =>
    {
        expect(clean('example.com')).toBe('example.com');
    });

    it('drops the scheme, the port and the path', () =>
    {
        expect(clean('https://example.com:8443/news')).toBe('example.com');
    });

    it('lowercases and drops a trailing dot', () =>
    {
        expect(clean('Example.COM.')).toBe('example.com');
    });
});

describe('buildPac', () =>
{
    // With nothing to route, the browser must be told to go straight out: a file that
    // proxied everything would be worse than no file at all.
    it('sends everything direct when no host needs the proxy', () =>
    {
        expect(ask(buildPac([], [{ way: 'name', port: 3128 }]), 'example.com')).toBe('DIRECT');
    });

    it('sends a listed host through the proxy', () =>
    {
        expect(ask(buildPac(['blocked.example'], [{ way: 'name', port: 3128 }]), 'blocked.example'))
            .toBe('PROXY 127.0.0.1:3128');
    });

    // Everything the person does that is not blocked must not pass through here.
    it('sends everything else straight out', () =>
    {
        const pac = buildPac(['blocked.example'], [{ way: 'name', port: 3128 }]);

        expect(ask(pac, 'example.com')).toBe('DIRECT');
        expect(ask(pac, 'bank.example')).toBe('DIRECT');
    });

    it('covers anything under a listed host', () =>
    {
        const pac = buildPac(['blocked.example'], [{ way: 'name', port: 3128 }]);

        expect(ask(pac, 'www.blocked.example')).toBe('PROXY 127.0.0.1:3128');
        expect(ask(pac, 'a.b.blocked.example')).toBe('PROXY 127.0.0.1:3128');
    });

    // A name that merely ends the same way belongs to somebody else.
    it('does not catch a host that only ends the same way', () =>
    {
        const pac = buildPac(['blocked.example'], [{ way: 'name', port: 3128 }]);

        expect(ask(pac, 'notblocked.example')).toBe('DIRECT');
    });

    it('carries the port it was given', () =>
    {
        const pac = buildPac(['blocked.example'], [{ way: 'name', port: 9999 }]);

        expect(ask(pac, 'blocked.example')).toBe('PROXY 127.0.0.1:9999');
    });

    it('lists a host once however often it was given', () =>
    {
        const same = ['a.example', 'A.example', 'https://a.example/x'];
        const pac = buildPac(same, [{ way: 'name', port: 3128 }]);

        expect(pac.match(/"a\.example"/g)).toHaveLength(1);
    });

    it('leaves out anything that is not a host', () =>
    {
        const pac = buildPac(['', '   '], [{ way: 'name', port: 3128 }]);

        expect(ask(pac, 'example.com')).toBe('DIRECT');
    });
});
