import { describe, expect, it } from 'vitest';
import { findTunnels, looksLikeTunnel } from './tunnels.ts';

describe('looksLikeTunnel', () =>
{
    it.each([
        ['tun0'], ['tap0'], ['wg0'], ['utun3'], ['ppp0'],
        ['nordlynx'], ['ProtonVPN'], ['ZeroTier One'],
    ])('reads %s as a tunnel', (name) =>
    {
        expect(looksLikeTunnel(name)).toBe(true);
    });

    // Windows names an adapter after the product rather than the kind.
    it.each([['OpenVPN TAP-Windows6'], ['WireGuard Tunnel'], ['Some VPN Adapter']])(
        'reads the windows name %s as a tunnel', (name) =>
        {
            expect(looksLikeTunnel(name)).toBe(true);
        });

    it.each([['eth0'], ['en0'], ['wlan0'], ['Ethernet'], ['Wi-Fi']])(
        'leaves the ordinary adapter %s alone', (name) =>
        {
            expect(looksLikeTunnel(name)).toBe(false);
        });
});

describe('findTunnels', () =>
{
    // The machine running the tests has whatever it has, so the shape is what can be
    // asserted rather than the contents.
    it('names every adapter it can see', () =>
    {
        const found = findTunnels();

        expect(Array.isArray(found.adapters)).toBe(true);
        expect(found.adapters.every((a) => a.addresses.length > 0)).toBe(true);
    });

    it('lists the tunnelling ones out of the adapters it found', () =>
    {
        const found = findTunnels();
        const expected = found.adapters.filter((a) => a.tunnel).map((a) => a.name);

        expect(found.tunnelling).toEqual(expected);
    });

    // Loopback is on every machine and is not a way out of it.
    it('leaves out the interfaces that go nowhere', () =>
    {
        expect(findTunnels().adapters.some((a) => a.name === 'lo')).toBe(false);
    });
});
