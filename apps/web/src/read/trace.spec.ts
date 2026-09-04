import { describe, expect, it } from 'vitest';
import { ceilingOf, plot, riseOf } from './trace';
import type { Run } from '../types';

const run = (averageMs: number | null): Run =>
    ({ checkedAt: '2026-08-26 20:00', lossPercent: averageMs === null ? 100 : 0, averageMs });

describe('plot', () =>
{
    it('draws nothing when there is nothing to draw', () =>
    {
        expect(plot([], 100, 200, 40)).toEqual({ line: '', gaps: [] });
    });

    it('spreads the runs across the width, oldest on the left', () =>
    {
        const { line } = plot([run(10), run(10), run(10)], 10, 200, 40);

        expect(line.split(' ').map((p) => p.split(',')[0])).toEqual(['0', '100', '200']);
    });

    it('puts a single run in the middle rather than against the edge', () =>
    {
        expect(plot([run(10)], 12, 200, 40).line.split(',')[0]).toBe('100');
    });

    // A lost run has no latency to place, so the line breaks and the loss is marked.
    it('leaves a gap where the run was lost', () =>
    {
        const { line, gaps } = plot([run(10), run(null), run(10)], 10, 200, 40);

        expect(line.split(' ')).toHaveLength(2);
        expect(gaps).toEqual([100]);
    });

    it('draws a slower reply higher than a fast one', () =>
    {
        const { line } = plot([run(5), run(500)], 600, 200, 40);
        const heights = line.split(' ').map((p) => Number(p.split(',')[1]));

        expect(heights[1]).toBeLessThan(heights[0] ?? 0);
    });
});

describe('riseOf', () =>
{
    it('places a reply at its share of the ceiling', () =>
    {
        expect(riseOf(50, 100, 40)).toBe(20);
    });

    it('never draws below the floor', () =>
    {
        expect(riseOf(0, 400, 40)).toBe(2);
    });

    // A reply slower than the ceiling would otherwise be drawn outside the lane.
    it('never draws above the lane', () =>
    {
        expect(riseOf(900, 400, 40)).toBe(40);
    });
});

describe('ceilingOf', () =>
{
    // Room above the slowest reply, or the line runs along the top edge.
    it('leaves headroom over the slowest reply', () =>
    {
        expect(ceilingOf([run(100), run(50)])).toBeCloseTo(120, 5);
    });

    it('never returns zero, so nothing divides by it', () =>
    {
        expect(ceilingOf([run(null)])).toBeGreaterThan(0);
        expect(ceilingOf([])).toBeGreaterThan(0);
    });
});
