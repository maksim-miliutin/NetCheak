import { useState } from 'react';
import { checkUpdate, getOutbound } from '../api';
import type { Newer, Outbound } from '../types';

/**
 * The answers asked for once and shown until something else is asked.
 *
 * Six states in the page held the same shape between them: nothing, then an
 * answer, and a line of catching whatever went wrong. What differed was the
 * call. Holding them apart meant six ways to be almost the same.
 */
export interface Asked
{
    /** What leaves this machine, or nothing while nobody has asked. */
    leaves: Outbound | null;
    /** Whether a newer version exists, or nothing while nobody has asked. */
    newer: Newer | null;

    /** Asked again while already shown, this puts it away. */
    showLeaves: () => Promise<void>;
    lookForUpdate: () => Promise<void>;
}

export function useAsked(complain: (about: string) => void): Asked
{
    const [leaves, setLeaves] = useState<Outbound | null>(null);
    const [newer, setNewer] = useState<Newer | null>(null);

    const trying = async (what: () => Promise<void>): Promise<void> =>
    {
        try
        {
            await what();
        }
        catch (err)
        {
            complain((err as Error).message);
        }
    };

    return {
        leaves,
        newer,

        // A second press puts the list away rather than fetching it again: it is
        // a drawer, and a drawer that only opens is a drawer nobody closes.
        showLeaves: () => trying(async () =>
            setLeaves(leaves === null ? await getOutbound() : null)),

        // The list of what leaves goes with it: the update check is one of the
        // things on that list, and it has just happened.
        lookForUpdate: () => trying(async () =>
        {
            setNewer(await checkUpdate());
            setLeaves(null);
        }),
    };
}
