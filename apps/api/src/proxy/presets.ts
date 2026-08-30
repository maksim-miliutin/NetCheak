import type { Way } from './ways.ts';

export interface Preset
{
    id: string;
    way: Way;
    /** Look names up over HTTPS as well, for a block that is in the answer. */
    overHttps: boolean;
    /** How long to hold each piece back. Longer defeats more, and costs more. */
    gapMs: number;
}

/**
 * Named combinations rather than switches. Zapret ships a folder of these called
 * ALT, ALT2, ALT13 and so on, and a person tries them in turn without being told what
 * any of them does. The names here say what happens, and the check beside them says
 * which one worked, so nobody has to guess through thirteen files.
 */
export const PRESETS: Preset[] =
[
    // Lite: the hello cut through the name. The lightest thing that gets past a
    // filter reading it, and where anybody should start.
    { id: 'lite-1', way: 'name', overHttps: false, gapMs: 30 },
    { id: 'lite-2', way: 'name', overHttps: true, gapMs: 30 },
    { id: 'lite-3', way: 'first-byte', overHttps: true, gapMs: 60 },

    // Shred: the write in pieces, none of them holding anything to act on.
    { id: 'shred-1', way: 'many', overHttps: true, gapMs: 40 },
    { id: 'shred-2', way: 'tiny', overHttps: true, gapMs: 25 },

    // Records: the handshake reframed into records of its own. Not packet splitting
    // at all, and it gets past different filters.
    { id: 'records-1', way: 'records', overHttps: true, gapMs: 40 },
    { id: 'records-2', way: 'records-three', overHttps: true, gapMs: 40 },
    { id: 'records-3', way: 'records', overHttps: true, gapMs: 120 },

    // Mix: both at once, for a filter that reassembles one and not the other.
    { id: 'mix-1', way: 'both', overHttps: true, gapMs: 50 },
    { id: 'mix-2', way: 'both', overHttps: true, gapMs: 200 },
];

export function presetById(id: string): Preset | null
{
    return PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * The preset to reach for, given which way of writing got through. Picking the
 * lightest one that works matters: every one of these costs something, and the
 * heavier ones cost more than the block does.
 */
export function presetFor(way: Way | null): Preset | null
{
    if (way === null || way === 'whole')
    {
        return null;
    }

    return PRESETS.find((preset) => preset.way === way) ?? null;
}

/**
 * Families together, cheapest family first, and within a family in its own order.
 * Sorting the whole list by cost alone put Shred 2 above Lite 2 above Shred 1, which
 * reads as though the numbering means nothing.
 */
export function inOrder(): Preset[]
{
    const families = [...new Set(PRESETS.map(familyOf))];

    families.sort((a, b) => cheapestIn(a) - cheapestIn(b));

    return families.flatMap((family) => PRESETS.filter((one) => familyOf(one) === family));
}

export function familyOf(preset: Preset): string
{
    return preset.id.split('-')[0] ?? preset.id;
}

function cheapestIn(family: string): number
{
    return Math.min(...PRESETS.filter((one) => familyOf(one) === family).map(cost));
}

function cost(preset: Preset): number
{
    // A lookup over HTTPS is a round trip before the connection starts; a longer gap
    // is paid on every connection that goes through.
    return preset.gapMs + (preset.overHttps ? 40 : 0);
}
