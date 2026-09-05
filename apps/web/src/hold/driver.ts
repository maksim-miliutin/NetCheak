import { useEffect, useState } from 'react';
import { forgetHelped, getDivert, getHelped, helpAlso, searchDivert }
    from '../api';
import type { DivertState, DriverFound, Searched } from '../types';

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

    /** Sites the driver helps, and what worked for each. */
    helped: DriverFound[];
    /** What is typed into the search, before anybody presses anything. */
    typed: string;
    searching: boolean;
    found: Searched | null;

    type: (host: string) => void;
    search: () => Promise<void>;

    /** Helps another site with what already worked, without searching again. */
    also: () => Promise<void>;
    forget: (host: string) => Promise<void>;
    put: (state: DivertState | null) => void;
}

export function useDriver(complain: (about: string) => void): Cutting
{
    const [state, setState] = useState<DivertState | null>(null);
    const [typed, setTyped] = useState('');
    const [searching, setSearching] = useState(false);
    const [found, setFound] = useState<Searched | null>(null);
    const [helped, setHelped] = useState<DriverFound[]>([]);

    // An answer that arrives short should cost a missing list, not a blank page:
    // this program is looked at when the network is already misbehaving.
    useEffect(() =>
    {
        getHelped().then((one) => setHelped(one.found ?? [])).catch(() => undefined);
    }, []);

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

    const trying = async (what: () => Promise<{ found: DriverFound[] }>): Promise<void> =>
    {
        try
        {
            setHelped((await what()).found ?? []);
        }
        catch (err)
        {
            complain((err as Error).message);
        }
    };

    return {
        state,
        typed,
        searching,
        found,
        helped,

        type: setTyped,
        put: setState,

        also: async () =>
        {
            const host = typed.trim();

            if (host === '')
            {
                return;
            }

            await trying(() => helpAlso(host));
            setTyped('');
        },

        forget: async (host: string) => trying(() => forgetHelped(host)),

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

                // A search that found something has just written a site down.
                await trying(getHelped);
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
