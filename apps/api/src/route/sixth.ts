import { networkInterfaces } from 'node:os';
import { reach, type Answer } from './rings.ts';

export type Sixth =
    | 'absent'
    | 'link-local-only'
    | 'working'
    | 'broken';

export interface SixthCheck
{
    state: Sixth;
    /** Global addresses the machine holds, which is what it would try to use. */
    addresses: string[];
    answer: Answer | null;
    ms: number | null;
}

// Cloudflare and Google both answer here and are reached over the sixth version only,
// so a connection proves the family works rather than that the name resolved.
const OUT_THERE = '2606:4700:4700::1111';

const PORT = 443;

/**
 * A machine with an address it cannot use is worse off than one without: the browser
 * tries the sixth version first, waits for it to fail and only then falls back, so
 * every page opens slowly for a reason nothing on screen explains.
 */
export async function checkSixth(host = OUT_THERE): Promise<SixthCheck>
{
    const addresses = globalSixes();

    if (addresses.length === 0)
    {
        return { state: stateOf([], null), addresses: [], answer: null, ms: null };
    }

    const answer = await reach(host, PORT);

    return {
        state: stateOf(addresses, answer.answer),
        addresses,
        answer: answer.answer,
        ms: answer.latencyMs,
    };
}

/**
 * Only the addresses the machine would actually reach the world with. Link-local ones
 * are on every interface whether the sixth version is carried or not, and unique-local
 * ones go no further than the house.
 */
export function globalSixes(): string[]
{
    const found: string[] = [];

    for (const list of Object.values(networkInterfaces()))
    {
        for (const entry of list ?? [])
        {
            if (entry.family === 'IPv6' && !entry.internal && isGlobal(entry.address))
            {
                found.push(entry.address);
            }
        }
    }

    return found;
}

export function isGlobal(address: string): boolean
{
    const plain = address.replace(/%.*$/, '').toLowerCase();

    // fe80::/10 is link-local, fc00::/7 is unique-local, ::1 is this machine.
    return !/^fe[89ab]/.test(plain) && !/^f[cd]/.test(plain) && plain !== '::1';
}

/** An address that leads nowhere is the finding; having none at all is ordinary. */
export function stateOf(addresses: string[], answer: Answer | null): Sixth
{
    if (addresses.length === 0)
    {
        return 'absent';
    }

    if (answer === null)
    {
        return 'link-local-only';
    }

    // A refusal is an answer: something out there received the packet and replied.
    return answer === 'silent' ? 'broken' : 'working';
}
