import { useCallback, useState } from 'react';

/** What is known about each target: a finished answer, or that one is on its way. */
export type Found<T> = Record<number, T | 'running'>;

export interface Lookup<T>
{
    found: Found<T>;
    ask: (id: number, host: string) => Promise<void>;
}

/**
 * Four handlers were written out separately for the trace, the packet size, who cut
 * the connection and whether splitting helps. Each was twenty lines of which one was
 * its own, and four copies of the same shape drift into four behaviours: one forgets
 * to clear the marker on failure, another leaves a stale answer in place.
 *
 * The marker matters more than it looks. A target left marked as running has a button
 * disabled forever, and the only way out is to reload the page.
 */
export function useLookup<T>(
    call: (host: string) => Promise<T>,
    onError: (message: string) => void,
): Lookup<T>
{
    const [found, setFound] = useState<Found<T>>({});

    const ask = useCallback(async (id: number, host: string): Promise<void> =>
    {
        setFound((current) => ({ ...current, [id]: 'running' }));

        try
        {
            const answer = await call(host);

            setFound((current) => ({ ...current, [id]: answer }));
        }
        catch (err)
        {
            // Cleared rather than left as it was: a target stuck on running has a
            // button that never comes back.
            setFound((current) => forget(current, id));
            onError((err as Error).message);
        }
    }, [call, onError]);

    return { found, ask };
}

/** Without the one asked about, and without changing the one it was given. */
export function forget<T>(found: Found<T>, id: number): Found<T>
{
    const without = { ...found };

    delete without[id];

    return without;
}

/** What is known about one target, or null when nothing has been asked. */
export function answerFor<T>(found: Found<T>, id: number): T | 'running' | null
{
    return found[id] ?? null;
}

/** How many targets have an answer that satisfies the question asked of it. */
export function countWhere<T>(found: Found<T>, matches: (answer: T) => boolean): number
{
    return Object.values(found)
        .filter((answer): answer is T => answer !== 'running')
        .filter((answer) => matches(answer))
        .length;
}
