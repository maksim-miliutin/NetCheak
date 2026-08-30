import type { Cause, Evasion, Path, Trace, Verdict } from './types';

/**
 * What the page works out before it draws anything: which link of the chain broke,
 * how a hop should read, what a number becomes when there is no number. Kept out of
 * the component because none of it needs a browser to be decided, and none of it was
 * being checked while it lived in one.
 */

export const CHAIN =
    ['This machine', 'Router', 'Provider', 'Names', 'Connections'] as const;

export type Link = (typeof CHAIN)[number];

/** Which link a cause points at, or none when the chain is not what broke. */
export const BREAKS: Record<Cause, Link | null> =
{
    'none': null,
    'never-checked': null,
    'link': 'Router',
    'router': 'Router',
    'provider': 'Provider',
    'dns': 'Names',
    'sinkholed': 'Names',
    'filtered': 'Connections',
    'handshake-cut': 'Connections',
    'remote': null,
    'unstable': null,
};

/** How far along the chain the check reached before it stopped. */
export function stopsAt(cause: Cause): number
{
    const broken = BREAKS[cause];

    return broken === null ? CHAIN.length : CHAIN.indexOf(broken);
}

/**
 * How one link should read. Nothing is claimed about a link past the break: the check
 * never got there, and drawing it as healthy would be an invention.
 */
export function linkState(index: number, stops: number, cause: Cause): string
{
    if (cause === 'never-checked')
    {
        return 'link untested';
    }

    if (index < stops)
    {
        return 'link passed';
    }

    return index === stops ? 'link broken' : 'link untested';
}

/**
 * Three outcomes, and only one of them is worth a person changing anything about.
 * A hello that goes through whole means there is nothing here to get past.
 */
export function readEvasion(evasion: Evasion): string
{
    if (evasion.splittingHelps)
    {
        return 'helps';
    }

    return evasion.whole === 'greeted' ? 'no-block' : 'no-help';
}

/**
 * Plenty of routers decline to answer while passing traffic along perfectly well, so
 * one quiet hop in the middle says nothing. Silence that never ends is where the path
 * stops.
 */
export function hopState(
    hop: { number: number; times: (number | null)[] },
    from: number | null,
): string
{
    if (from !== null && hop.number >= from)
    {
        return 'hop silent';
    }

    return hop.times.every((time) => time === null) ? 'hop passing' : 'hop';
}

/** The quickest of the probes, since the slow one is usually the router being busy. */
export function bestOf(times: (number | null)[]): string
{
    const answered = times.filter((time): time is number => time !== null);

    return answered.length === 0 ? '—' : `${Math.min(...answered)} ms`;
}

/** A dash rather than a zero: nothing measured is not the same as measured as none. */
export function format(value: number | null, unit: string): string
{
    return value === null ? '—' : `${value}${unit}`;
}

/** Whether a packet size is worth saying anything about. */
export function readSize(path: Path): 'short' | 'full' | 'unknown'
{
    if (path.error !== null || path.mtu === null)
    {
        return 'unknown';
    }

    return path.mtu < path.ordinary ? 'short' : 'full';
}

/** Whether a trace found anything to show. */
export function readTrace(trace: Trace): 'error' | 'empty' | 'hops'
{
    if (trace.error !== null)
    {
        return 'error';
    }

    return trace.hops.length === 0 ? 'empty' : 'hops';
}

/**
 * A link that opens this tool with whatever site the browser is on. It reads nothing
 * and stays nowhere: pressing it hands over one address and stops.
 */
export function bookmarklet(origin: string, path: string): string
{
    return `javascript:location.href=${JSON.stringify(`${origin}${path}`)}`
        + '+"?check="+encodeURIComponent(location.host)';
}

/** The names a verdict blames, joined the way the language joins things. */
export function blamed(verdict: Verdict, and: string): string
{
    const names = verdict.blame;

    if (names.length <= 1)
    {
        return names[0] ?? '';
    }

    return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}
