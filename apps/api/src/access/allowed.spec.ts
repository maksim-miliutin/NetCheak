import { describe, expect, it } from 'vitest';
import { mayAsk, mayRelay } from './allowed.ts';

const OURS = new Set(['http://127.0.0.1:3001', 'http://localhost:5173']);

describe('mayAsk', () =>
{
    it('lets its own interface through', () =>
    {
        expect(mayAsk('http://127.0.0.1:3001', OURS)).toBe(true);
        expect(mayAsk('http://localhost:5173', OURS)).toBe(true);
    });

    // A page on some other site, open in a tab, telling this machine to open
    // connections of its choosing.
    it('refuses a page on somebody else\u2019s site', () =>
    {
        expect(mayAsk('https://evil.example', OURS)).toBe(false);
        expect(mayAsk('http://127.0.0.1:9999', OURS)).toBe(false);
    });

    // A program running as this user can already do everything this API does, so
    // refusing it here would be comfort rather than defence.
    it('lets a program on this machine through, having no origin to give', () =>
    {
        expect(mayAsk(undefined, OURS)).toBe(true);
    });
});

describe('mayRelay', () =>
{
    it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('always relays for %s', (from) =>
    {
        expect(mayRelay(from, false)).toBe(true);
        expect(mayRelay(from, true)).toBe(true);
    });

    it('relays for nobody else until the network is asked for', () =>
    {
        expect(mayRelay('192.168.0.5', false)).toBe(false);
        expect(mayRelay('10.0.0.7', false)).toBe(false);
    });

    it.each(['192.168.0.5', '10.0.0.7', '172.16.4.2', '172.31.9.1', '169.254.3.3'])(
        'relays for %s once the network is asked for', (from) =>
    {
        expect(mayRelay(from, true)).toBe(true);
    });

    // Listening on every interface was the whole of the old answer, and on a machine
    // with a public address that is an open proxy facing the internet.
    it.each(['8.8.8.8', '203.0.113.9', '172.32.0.1', '172.15.0.1'])(
        'never relays for %s, network or no network', (from) =>
    {
        expect(mayRelay(from, true)).toBe(false);
        expect(mayRelay(from, false)).toBe(false);
    });

    it('reads an address the socket handed over in its sixth-version wrapping', () =>
    {
        expect(mayRelay('::ffff:192.168.0.5', true)).toBe(true);
        expect(mayRelay('::ffff:8.8.8.8', true)).toBe(false);
    });

    it('refuses a connection whose address it never learned', () =>
    {
        expect(mayRelay(undefined, true)).toBe(false);
        expect(mayRelay('', true)).toBe(false);
    });
});
