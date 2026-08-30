import { networkInterfaces } from 'node:os';

export interface Adapter
{
    name: string;
    addresses: string[];
    tunnel: boolean;
}

export interface Tunnels
{
    adapters: Adapter[];
    /** Names of the adapters that look like a tunnel, in the order found. */
    tunnelling: string[];
}

/**
 * Names an operating system gives a tunnel. A virtual private network, a corporate
 * client and a container bridge all show up this way, and telling them apart from the
 * name alone is not possible.
 */
const TUNNEL = /^(tun|tap|wg|utun|ppp|nordlynx|proton|wintun|zt\d)/i;

const WINDOWS_TUNNEL = /(vpn|tunnel|tap-|wireguard|openvpn|wintun|zerotier|tailscale)/i;

/**
 * Whether a tunnel is up, as far as the machine will say. What travels through it is
 * not visible from here, so nothing is claimed about that: an interface being present
 * is a fact, and "you are protected" would be a guess.
 */
export function findTunnels(): Tunnels
{
    const adapters: Adapter[] = [];

    for (const [name, list] of Object.entries(networkInterfaces()))
    {
        const usable = (list ?? []).filter((entry) => !entry.internal);

        if (usable.length === 0)
        {
            continue;
        }

        adapters.push({
            name,
            addresses: usable.map((entry) => entry.address),
            tunnel: looksLikeTunnel(name),
        });
    }

    return {
        adapters,
        tunnelling: adapters.filter((adapter) => adapter.tunnel).map((adapter) => adapter.name),
    };
}

export function looksLikeTunnel(name: string): boolean
{
    return TUNNEL.test(name) || WINDOWS_TUNNEL.test(name);
}
