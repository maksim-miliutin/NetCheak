import { useState } from 'react';
import { forgetRoute, routeHost, toggleProxy } from '../api';
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

    pick: (preset: string) => void;
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

        pick: setChosen,
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
