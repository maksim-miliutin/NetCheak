import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AGES, sweepOf } from './keeping.ts';

describe('keeping', () =>
{
    it('gives every line of the policy a table, a column and a number of days', () =>
    {
        for (const age of AGES)
        {
            expect(age.table).toBeTruthy();
            expect(age.noted).toBeTruthy();
            expect(age.days).toBeGreaterThan(0);
        }
    });

    it('keeps what somebody chose and lets go of what a check wrote down', () =>
    {
        expect(sweepOf(AGES.find((one) => one.table === 'routed_hosts')!))
            .toContain('by_hand = 0');

        expect(sweepOf(AGES.find((one) => one.table === 'driver_found')!))
            .not.toContain('by_hand');
    });

    /**
     * The whole reason this exists: a table holding names of sites was added and
     * nobody remembered to sweep it, so a promise about not keeping them was true
     * only of the tables somebody had thought about.
     */
    it('has a line for every table that writes down when a row was made', () =>
    {
        const folder = join(import.meta.dirname, '..', '..', 'migrations');

        const sql = readdirSync(folder)
            .filter((name) => name.endsWith('.sql'))
            .map((name) => readFileSync(join(folder, name), 'utf8'))
            .join('\n');

        const dated = [...sql.matchAll(
            /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([^;]*?)\n\);/g)]
            .filter(([, , body]) => /(noted_at|found_at|started_at)/.test(body ?? ''))
            .map(([, table]) => table);

        const swept = new Set(AGES.map((one) => one.table));

        expect(dated.filter((table) => !swept.has(table))).toEqual([]);
    });
});
