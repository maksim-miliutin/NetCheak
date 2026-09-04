import { useEffect, useState } from 'react';
import { getDivert, searchDivert } from '../api';
import type { DivertState, Searched } from '../types';

/**
 * The driver and the search for what gets a site through.
 *
 * The driver has no switch of its own — it goes on with the proxy — so what is
 * held here is only what has to be looked at: the lines it prints, whether it
 * could be opened at all, and the answer the search came back with.
 */
export interface Cutting
{
    state: DivertState | null;
    /** What is typed into the search, before anybody presses anything. */
    typed: string;
    searching: boolean;
    found: Searched | null;

    type: (host: string) => void;
    search: () => Promise<void>;
    put: (state: DivertState | null) => void;
}

export function useDriver(complain: (about: string) => void): Cutting
{
    const [state, setState] = useState<DivertState | null>(null);
    const [typed, setTyped] = useState('');
    const [searching, setSearching] = useState(false);
    const [found, setFound] = useState<Searched | null>(null);

    // The loop prints as it goes, and asking once at startup left the log empty
    // and the state at running long after the driver had given up.
    useEffect(() =>
    {
        if (state?.running !== true)
        {
            return undefined;
        }

        const again = setInterval(() =>
        {
            getDivert().then(setState).catch(() => undefined);
        }, 1200);

        return () => clearInterval(again);
    }, [state?.running]);

    return {
        state,
        typed,
        searching,
        found,

        type: setTyped,
        put: setState,

        search: async () =>
        {
            const host = typed.trim();

            if (host === '')
            {
                return;
            }

            setSearching(true);
            setFound(null);

            try
            {
                const answer = await searchDivert(host);

                setFound(answer);
                setState(answer.state);
            }
            catch (err)
            {
                complain((err as Error).message);
            }
            finally
            {
                setSearching(false);
            }
        },
    };
}
