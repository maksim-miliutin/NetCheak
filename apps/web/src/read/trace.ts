import type { Run } from '../types';

export interface Plot
{
    /** Points along the lane, left to right, oldest first. */
    line: string;
    /** Where the run was lost entirely, as a share of the width. */
    gaps: number[];
}

const FLOOR = 2;

/**
 * Turns a target's runs into a line across its lane, scaled to that lane alone. A
 * scale shared with the other lanes flattened every trace against its ceiling: what a
 * trace is for is the shape of one target over time, and how one target compares to
 * another is what the numbers beside it say.
 */
export function plot(runs: Run[], ceiling: number, width: number, height: number): Plot
{
    if (runs.length === 0)
    {
        return { line: '', gaps: [] };
    }

    const step = runs.length === 1 ? 0 : width / (runs.length - 1);
    const points: string[] = [];
    const gaps: number[] = [];

    runs.forEach((run, index) =>
    {
        const x = runs.length === 1 ? width / 2 : index * step;

        if (run.averageMs === null)
        {
            gaps.push(x);

            return;
        }

        points.push(`${round(x)},${round(height - riseOf(run.averageMs, ceiling, height))}`);
    });

    return { line: points.join(' '), gaps };
}

export function riseOf(averageMs: number, ceiling: number, height: number): number
{
    const share = averageMs / Math.max(ceiling, 1);

    return Math.max(FLOOR, Math.min(1, share) * height);
}

/**
 * The ceiling of one lane: its slowest reply with room above it, so the line has
 * somewhere to go and does not run along the top edge.
 */
export function ceilingOf(runs: Run[]): number
{
    const times = runs.map((run) => run.averageMs ?? 0);

    return Math.max(...times, 1) * 1.2;
}

function round(value: number): number
{
    return Math.round(value * 10) / 10;
}
