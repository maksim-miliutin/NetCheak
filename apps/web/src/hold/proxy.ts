import { useState } from 'react';
import { forgetRoute, getProxy, routeHost, searchProxy, toggleProxy, type Chose }
    from '../api';
import type { ProxyState, Way } from '../types';

/**
 * Everything the proxy block needs to hold, in one place.
 *
 * It sat among thirty-one states in the page: which preset is chosen, whether
 * the network is served, whether a switch is in flight, what somebody is typing
 * into the list of their own sites. Reading the page meant reading all of it to
 * find out which four belonged together.
 */
export interface Proxying
{
    state: ProxyState | null;
    /** The preset picked but not yet applied, empty for every way at once. */
    chosen: string;
    forPhone: boolean;
    switching: boolean;
    typedSite: string;
    siteWay: Way;

    /** What is typed into the search for a set, before anybody presses it. */
    typedFind: string;
    finding: boolean;
    chose: Chose | null;

    pick: (preset: string) => void;
    typeFind: (host: string) => void;

    /** Tries the ways against one site and turns on the set that got through. */
    find: () => Promise<void>;
    servePhone: (yes: boolean) => void;
    typeSite: (host: string) => void;
    pickWay: (way: Way) => void;

    /** Turns it on or off, and the driver goes with it on the server side. */
    toggle: (preset?: string) => Promise<void>;
    add: () => Promise<void>;
    drop: (host: string) => Promise<void>;

    /** Told from outside when a whole page load brings a newer state. */
    put: (state: ProxyState | null) => void;
}

export function useProxy(complain: (about: string) => void): Proxying
{
    const [state, setState] = useState<ProxyState | null>(null);
    const [chosen, setChosen] = useState('');
    const [forPhone, setForPhone] = useState(false);
    const [switching, setSwitching] = useState(false);
    const [typedSite, setTypedSite] = useState('');
    const [siteWay, setSiteWay] = useState<Way>('name');
    const [typedFind, setTypedFind] = useState('');
    const [finding, setFinding] = useState(false);
    const [chose, setChose] = useState<Chose | null>(null);

    // The same four lines wrapped seven handlers in the page. What differs
    // between them is one call; what they share is what to do when it throws.
    const trying = async (what: () => Promise<ProxyState>): Promise<void> =>
    {
        try
        {
            setState(await what());
        }
        catch (err)
        {
            complain((err as Error).message);
        }
    };

    return {
        state,
        chosen,
        forPhone,
        switching,
        typedSite,
        siteWay,
        typedFind,
        finding,
        chose,

        pick: setChosen,
        typeFind: setTypedFind,

        find: async () =>
        {
            const host = typedFind.trim();

            if (host === '')
            {
                return;
            }

            setFinding(true);
            setChose(null);

            try
            {
                const answer = await searchProxy(host);

                setChose(answer);

                // The server turned it on, so what is held here is behind by one:
                // asked again rather than guessed at.
                if (answer.started)
                {
                    setState(await getProxy());
                }
            }
            catch (err)
            {
                complain((err as Error).message);
            }
            finally
            {
                setFinding(false);
            }
        },
        servePhone: setForPhone,
        typeSite: setTypedSite,
        pickWay: setSiteWay,
        put: setState,

        toggle: async (preset?: string) =>
        {
            setSwitching(true);

            await trying(() =>
                toggleProxy(preset ?? (chosen === '' ? undefined : chosen), forPhone));

            setSwitching(false);
        },

        add: async () =>
        {
            const host = typedSite.trim();

            if (host === '')
            {
                return;
            }

            await trying(() => routeHost(host, siteWay));
            setTypedSite('');
        },

        drop: async (host: string) => trying(() => forgetRoute(host)),
    };
}
