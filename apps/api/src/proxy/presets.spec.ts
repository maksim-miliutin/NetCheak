import { describe, expect, it } from 'vitest';
import { inOrder, PRESETS, presetById, presetFor } from './presets.ts';
import { WAYS } from './ways.ts';

describe('the presets', () =>
{
    it('names each of them once', () =>
    {
        const names = PRESETS.map((preset) => preset.id);

        expect(new Set(names).size).toBe(names.length);
    });

    // A preset naming a way that does not exist would start a proxy that writes
    // nothing in particular.
    it('only ever asks for a way that exists', () =>
    {
        for (const preset of PRESETS)
        {
            expect(WAYS).toContain(preset.way);
        }
    });

    // Sending the hello whole is the thing being got past, not a way past it.
    it('never offers sending it whole as a preset', () =>
    {
        expect(PRESETS.some((preset) => preset.way === 'whole')).toBe(false);
    });

    it('covers every way that can get past something', () =>
    {
        const covered = new Set(PRESETS.map((preset) => preset.way));

        for (const way of WAYS.filter((one) => one !== 'whole'))
        {
            expect(covered.has(way)).toBe(true);
        }
    });

    it('holds each piece back by some amount', () =>
    {
        for (const preset of PRESETS)
        {
            expect(preset.gapMs).toBeGreaterThan(0);
        }
    });
});

describe('presetById', () =>
{
    it('finds one by name', () =>
    {
        expect(presetById('records-1')?.way).toBe('records');
    });

    it('says nothing for a name nobody offered', () =>
    {
        expect(presetById('alt13')).toBeNull();
    });
});

describe('presetFor', () =>
{
    it('reaches for the preset built on the way that worked', () =>
    {
        expect(presetFor('records')?.id).toBe('records-1');
        expect(presetFor('many')?.id).toBe('shred-1');
    });

    // Nothing needed getting past, so nothing should be started.
    it('offers nothing when the hello went through whole', () =>
    {
        expect(presetFor('whole')).toBeNull();
        expect(presetFor(null)).toBeNull();
    });
});

// A family whose numbers skip one, or start at two, reads as though something is
// missing from the list.
describe('the families', () =>
{
    it('numbers each family from one, without gaps', () =>
    {
        const families = new Map<string, number[]>();

        for (const preset of PRESETS)
        {
            const [family, number] = preset.id.split('-');

            families.set(family ?? '', [...(families.get(family ?? '') ?? []),
                Number(number)]);
        }

        for (const [family, numbers] of families)
        {
            const sorted = [...numbers].sort();

            expect(sorted, family).toEqual(numbers.map((_, i) => i + 1));
        }
    });

    it('gives every preset a family and a number', () =>
    {
        for (const preset of PRESETS)
        {
            expect(preset.id, preset.id).toMatch(/^[a-z]+-\d+$/);
        }
    });
});

describe('inOrder', () =>
{
    // Every one of these costs something, and the heavier ones cost more than the
    // block does, so the cheapest that works is the one to use.
    it('puts the cheapest family first', () =>
    {
        const order = inOrder();

        expect(order[0]?.id).toBe('lite-1');
        expect(order[order.length - 1]?.id).toBe('mix-2');
    });

    // Sorting by cost alone put Shred 2 above Lite 2 above Shred 1, which reads as
    // though the numbering means nothing.
    it('keeps a family together and in its own order', () =>
    {
        const ids = inOrder().map((preset) => preset.id);
        const lite = ids.filter((id) => id.startsWith('lite'));

        expect(lite).toEqual(['lite-1', 'lite-2', 'lite-3']);
        expect(ids.indexOf('lite-3')).toBe(ids.indexOf('lite-1') + 2);
    });

    // Two presets built on the same way have to differ in what they cost, or one of
    // them is a duplicate wearing a different name.
    it('never offers two that are the same thing', () =>
    {
        const shapes = PRESETS.map((p) => `${p.way}:${p.overHttps}:${p.gapMs}`);

        expect(new Set(shapes).size).toBe(shapes.length);
    });

    it('keeps every preset', () =>
    {
        expect(inOrder()).toHaveLength(PRESETS.length);
    });

    it('leaves the original list alone', () =>
    {
        const before = PRESETS.map((preset) => preset.id);

        inOrder();

        expect(PRESETS.map((preset) => preset.id)).toEqual(before);
    });
});
