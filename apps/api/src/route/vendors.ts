/**
 * Who made the card, read out of the address itself. The first three bytes of a MAC
 * are handed out to manufacturers, so a table of the ones seen in a home covers most
 * of what a person will find on their own network.
 *
 * Two honest limits, and both are said out loud rather than guessed around. The list
 * is short — a full one runs to thirty thousand entries and would be most of this
 * program. And a phone that randomises its address every network cannot be known at
 * all: that is the point of randomising it.
 */

export type Kind = 'router' | 'phone' | 'computer' | 'console' | 'other' | 'unknown';

export interface Maker
{
    /** Who made the card, or nothing when the address says nothing. */
    vendor: string | null;
    kind: Kind;
    /** The address was made up for this network, so nobody made anything. */
    randomised: boolean;
}

// Kept to what turns up on a home network, which is a fraction of the thirty-odd
// thousand prefixes handed out. A full list means either a megabyte inside the
// binary or asking somebody else's server what is on this network, and the second
// one is worse than not knowing.
//
// Sorted by who, not by number: this is read by people more often than by the
// program.
const MAKERS: [string, string, Kind][] =
[
    ['00037F', 'Atheros', 'computer'],
    ['A8A237', 'Arcadyan', 'router'],
    ['ACB687', 'Arcadyan', 'router'],
    ['D84489', 'TP-Link', 'router'],
    ['0004ED', 'Billion', 'router'],
    ['000C29', 'VMware', 'computer'],
    ['001018', 'Broadcom', 'computer'],
    ['0017C8', 'Kyocera', 'other'],
    ['001A11', 'Google', 'other'],
    ['002454', 'Sony', 'console'],
    ['0025DC', 'ASUS', 'computer'],
    ['0050F2', 'Microsoft', 'computer'],
    ['00E04C', 'Realtek', 'computer'],
    ['08606E', 'ASUS', 'computer'],
    ['0C9D92', 'ASUS', 'computer'],
    ['1005E7', 'Nintendo', 'console'],
    ['14AE85', 'Keenetic', 'router'],
    ['185936', 'Xiaomi', 'phone'],
    ['1C872C', 'ASUS', 'computer'],
    ['286C07', 'Xiaomi', 'phone'],
    ['2C5491', 'Huawei', 'phone'],
    ['30B5C2', 'TP-Link', 'router'],
    ['34E894', 'TP-Link', 'router'],
    ['38F73D', 'Amazon', 'other'],
    ['3C22FB', 'Apple', 'phone'],
    ['40B076', 'ASUS', 'computer'],
    ['44D9E7', 'Ubiquiti', 'router'],
    ['4C1D96', 'Intel', 'computer'],
    ['503EAA', 'TP-Link', 'router'],
    ['5254AB', 'Realtek', 'computer'],
    ['58D56E', 'D-Link', 'router'],
    ['5C521E', 'Xiaomi', 'phone'],
    ['6045CB', 'ASUS', 'computer'],
    ['6C5AB0', 'TCL', 'other'],
    ['7085C2', 'ASUS', 'computer'],
    ['74DA88', 'TP-Link', 'router'],
    ['7C10C9', 'ASUS', 'computer'],
    ['80CE62', 'Hewlett-Packard', 'computer'],
    ['847BEB', 'Dell', 'computer'],
    ['88366C', 'Espressif', 'other'],
    ['8C1645', 'Samsung', 'phone'],
    ['902B34', 'Gigabyte', 'computer'],
    ['9C5C8E', 'ASRock', 'computer'],
    ['A0AB1B', 'D-Link', 'router'],
    ['A4C3F0', 'Intel', 'computer'],
    ['A85E45', 'ASUS', 'computer'],
    ['AC220B', 'ASUS', 'computer'],
    ['B0BE76', 'TP-Link', 'router'],
    ['B827EB', 'Raspberry Pi', 'computer'],
    ['BC2411', 'MikroTik', 'router'],
    ['C46E1F', 'TP-Link', 'router'],
    ['C87F54', 'Samsung', 'phone'],
    ['CC2D21', 'Sony', 'console'],
    ['D8478F', 'Zyxel', 'router'],
    ['D85DE2', 'Samsung', 'phone'],
    ['DC2C6E', 'ASUS', 'computer'],
    ['E0286D', 'AVM', 'router'],
    ['E4956E', 'Espressif', 'other'],
    ['F02FA7', 'Apple', 'phone'],
    ['F0B4D2', 'D-Link', 'router'],
    ['F4F5DB', 'Xiaomi', 'phone'],
    ['FCFBFB', 'Cisco', 'router'],
];

const BY_PREFIX = new Map(MAKERS.map(([prefix, vendor, kind]) => [prefix, { vendor, kind }]));

/** Who made the card at this address, as far as the address is willing to say. */
export function makerOf(hardware: string): Maker
{
    const bytes = hardware.replace(/[^0-9a-fA-F]/g, '').toUpperCase();

    if (bytes.length < 6)
    {
        return { vendor: null, kind: 'unknown', randomised: false };
    }

    if (randomised(bytes))
    {
        return { vendor: null, kind: 'unknown', randomised: true };
    }

    const found = BY_PREFIX.get(bytes.slice(0, 6));

    return found === undefined
        ? { vendor: null, kind: 'unknown', randomised: false }
        : { vendor: found.vendor, kind: found.kind, randomised: false };
}

/**
 * The second bit of the first byte says the address was made up rather than handed
 * out. Phones set it on purpose, so that a network cannot recognise them twice.
 */
export function randomised(bytes: string): boolean
{
    const first = Number.parseInt(bytes.slice(0, 2), 16);

    return Number.isFinite(first) && (first & 0x02) !== 0;
}
