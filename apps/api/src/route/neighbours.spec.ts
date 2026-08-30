import { describe, expect, it } from 'vitest';
import { parseNeighbours } from './neighbours.ts';

const WINDOWS = `
Interface: 192.168.1.42 --- 0xd
  Internet Address      Physical Address      Type
  192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic
  192.168.1.55          11-22-33-44-55-66     dynamic
  192.168.1.255         ff-ff-ff-ff-ff-ff     static
  224.0.0.22            01-00-5e-00-00-16     static
`;

const LINUX = `
192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE
192.168.1.55 dev eth0 lladdr 11:22:33:44:55:66 STALE
192.168.1.77 dev eth0  FAILED
`;

describe('parseNeighbours', () =>
{
    it.each([['windows', WINDOWS], ['linux', LINUX]])('reads the devices out of %s',
        (_name, output) =>
        {
            const found = parseNeighbours(output, null);

            expect(found.map((n) => n.address)).toEqual(['192.168.1.1', '192.168.1.55']);
        });

    // Windows separates a hardware address with dashes and everything else uses colons.
    it('writes every hardware address the same way', () =>
    {
        expect(parseNeighbours(WINDOWS, null)[0]?.hardware).toBe('aa:bb:cc:dd:ee:ff');
        expect(parseNeighbours(LINUX, null)[0]?.hardware).toBe('aa:bb:cc:dd:ee:ff');
    });

    // Broadcast and multicast rows are the machine talking to everybody, not a device.
    it('leaves out the addresses that are not devices', () =>
    {
        const found = parseNeighbours(WINDOWS, null);

        expect(found.some((n) => n.address === '192.168.1.255')).toBe(false);
        expect(found.some((n) => n.address === '224.0.0.22')).toBe(false);
    });

    // A row with no hardware address is one the system asked about and never heard from.
    it('leaves out an entry that never answered', () =>
    {
        expect(parseNeighbours(LINUX, null).some((n) => n.address === '192.168.1.77')).toBe(false);
    });

    it('marks the gateway, which is not a neighbour like the others', () =>
    {
        const found = parseNeighbours(LINUX, '192.168.1.1');

        expect(found[0]?.gateway).toBe(true);
        expect(found[1]?.gateway).toBe(false);
    });

    it('counts an address once however often the table repeats it', () =>
    {
        const twice = `${LINUX}\n192.168.1.55 dev wlan0 lladdr 11:22:33:44:55:66 REACHABLE`;

        expect(parseNeighbours(twice, null)).toHaveLength(2);
    });

    it('reads nothing out of nothing', () =>
    {
        expect(parseNeighbours('', null)).toEqual([]);
    });
});
