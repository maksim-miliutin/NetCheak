/**
 * How long anything is kept, in one place and as a list rather than as code.
 *
 * It was two numbers in the signature of a repository method — `prune(sampleDays = 7,
 * runDays = 365)` — which is a policy turned inside out. And it swept measurements
 * while leaving the two tables that hold names of sites, so "only a name is stored"
 * quietly meant "a name is stored forever".
 */

export interface Age
{
    table: string;
    /** The column holding when the row was written. */
    noted: string;
    days: number;
    /**
     * Rows somebody chose by hand stay. They asked for them, and a tool that forgets
     * what it was told is worse than one that remembers too long.
     */
    keepChosen: boolean;
}

export const AGES: Age[] =
[
    { table: 'checks', noted: 'started_at', days: 365, keepChosen: false },
    { table: 'routed_hosts', noted: 'noted_at', days: 90, keepChosen: true },
    { table: 'driver_found', noted: 'found_at', days: 90, keepChosen: false },
];

/** The delete for one line of the policy, written once rather than three times. */
export function sweepOf(age: Age): string
{
    const chosen = age.keepChosen ? ' AND by_hand = 0' : '';

    return `DELETE FROM ${age.table} WHERE ${age.noted} < datetime('now', ?)${chosen}`;
}
