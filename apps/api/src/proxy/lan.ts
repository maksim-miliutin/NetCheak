import { networkInterfaces } from 'node:os';

/**
 * The address a phone on the same network would use. Found rather than asked for,
 * because somebody who wants their phone covered should not have to know how to look
 * their own address up.
 */
export function lanAddress(): string | null
{
    const found: string[] = [];

    for (const list of Object.values(networkInterfaces()))
    {
        for (const entry of list ?? [])
        {
            if (entry.family === 'IPv4' && !entry.internal && isPrivate(entry.address))
            {
                found.push(entry.address);
            }
        }
    }

    return found[0] ?? null;
}

/**
 * Only addresses inside a home network. A public one would mean the proxy is exposed
 * to the whole internet rather than to the flat, and nobody should be handed that by
 * a tool that found it for them.
 */
export function isPrivate(address: string): boolean
{
    return /^10\./.test(address)
        || /^192\.168\./.test(address)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}
