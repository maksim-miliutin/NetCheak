import type { TargetRow } from '../db/checks.repository.ts';
import { CLOUDFLARE } from '../speed/transfer.ts';
import { RELEASES_URL } from '../update/version.ts';
import { RESOLVERS } from '../dns/doh.ts';

export interface Errand
{
    where: string;
    why: string;
    /** Whether it happens on its own, or only when a button is pressed. */
    onDemand: boolean;
}

export interface Outbound
{
    errands: Errand[];
    /** Things the tool never does, worth saying because people expect it to. */
    never: string[];
}

const REFERENCE_RESOLVER = '1.1.1.1';

/**
 * Every place this tool will send a packet, built from the same values the code uses
 * rather than written out beside it. A promise about privacy that lives in prose goes
 * stale the first time somebody adds a call; this list cannot.
 */
export function outbound(
    targets: TargetRow[],
    updates = false,
    proxyPort: number | null = null,
    overHttps = false,
): Outbound
{
    const errands: Errand[] = targets
        .filter((target) => target.enabled)
        .map((target) => (
        {
            where: `${target.host}:${target.port}`,
            why: 'a target you chose to watch',
            onDemand: false,
        }));

    errands.push({
        where: REFERENCE_RESOLVER,
        why: 'asked the same name as your own resolver, to compare the answers',
        onDemand: true,
    });

    errands.push({
        where: new URL(CLOUDFLARE.download(1)).host,
        why: 'the speed measurement pulls and pushes data here',
        onDemand: true,
    });

    // Only listed when it is switched on, because only then does it happen. A list
    // that claims errands the tool is not running is as misleading as one that hides
    // errands it is.
    if (updates)
    {
        errands.push({
            where: new URL(RELEASES_URL).host,
            why: 'asked whether a newer version exists; nothing is sent but the question',
            onDemand: true,
        });
    }

    // The proxy changes where the browser's traffic goes, which is the largest thing
    // this tool can do to a machine. Saying so is not optional.
    if (proxyPort !== null)
    {
        errands.push({
            where: `127.0.0.1:${proxyPort}`,
            why: 'the splitting proxy is running; traffic pointed at it is relayed '
                + 'onward without being read',
            onDemand: true,
        });
    }

    // Names looked up over HTTPS travel to whichever resolver answers, and that is a
    // different place than the proxy itself.
    if (overHttps)
    {
        for (const resolver of RESOLVERS)
        {
            errands.push({
                where: new URL(resolver).host,
                why: 'names are looked up here over HTTPS, so a hijacked plain answer '
                    + 'cannot reach them',
                onDemand: true,
            });
        }
    }

    return {
        errands,
        never:
        [
            'No telemetry, no analytics, no account',
            'The check for a newer version is off unless you turn it on, and is listed '
                + 'above when you do',
            'No results are uploaded anywhere: the history stays in a file on this machine',
            'Your location is never asked for and never sent',
            'Nothing is read about pages you visit or what your traffic contains',
        ],
    };
}
