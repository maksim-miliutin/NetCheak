import type { StatusRow } from '../db/checks.repository.ts';
import type { Rings } from '../route/rings.ts';
import type { DnsCheck } from '../dns/resolve.ts';
import type { TlsCheck } from '../tls/handshake.ts';

export type Level = 'ok' | 'warn' | 'down' | 'unknown';

export type Cause =
    | 'none'
    | 'never-checked'
    | 'link'
    | 'router'
    | 'provider'
    | 'dns'
    | 'sinkholed'
    | 'filtered'
    | 'handshake-cut'
    | 'remote'
    | 'unstable';

export interface Verdict
{
    level: Level;
    cause: Cause;
    reachable: number;
    total: number;
    // Names the targets the cause rests on, so the interface can point at the rows
    // instead of asking the reader to take the verdict on faith.
    blame: string[];
}

const LOSS_LIMIT = 20;
const JITTER_LIMIT = 30;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Reads the layer results and names what broke, or says it cannot tell. */
export function judge(
    targets: StatusRow[],
    rings?: Rings,
    dns?: DnsCheck,
    tls?: TlsCheck[],
): Verdict
{
    const checked = targets.filter((t) => t.quality !== null);

    if (checked.length === 0)
    {
        return {
            level: 'unknown',
            cause: 'never-checked',
            reachable: 0,
            total: targets.length,
            blame: [],
        };
    }

    const alive = checked.filter((t) => (t.lossPercent ?? 100) < 100);
    const dead = checked.filter((t) => (t.lossPercent ?? 100) >= 100);

    const base = { reachable: alive.length, total: checked.length };

    if (alive.length === 0)
    {
        // Every address failed, including the ones that need no name resolved. Whether
        // that is the router or everything past it depends on the nearest hop.
        const blame = checked.map((t) => t.name);

        return { ...base, level: 'down', cause: nothingWorks(rings), blame };
    }

    const deadNames = dead.filter((t) => !IPV4.test(t.host));
    const liveNames = alive.filter((t) => !IPV4.test(t.host));

    // Raw addresses answer while no name does: the packets travel and the lookup is
    // what fails. One working name is enough to clear resolution of the charge, so a
    // single dead host is somebody else's outage instead.
    if (dead.length > 0 && deadNames.length === dead.length && liveNames.length === 0
        && alive.some((t) => IPV4.test(t.host)))
    {
        const blame = deadNames.map((t) => t.name);

        return { ...base, level: 'down', cause: nameTrouble(dns), blame };
    }

    if (dead.length > 0)
    {
        return { ...base, level: 'warn', cause: 'remote', blame: dead.map((t) => t.name) };
    }

    // The probe opens a connection and closes it, which a filter reading the requested
    // name lets through: the cut comes later, during the handshake. Without this the
    // page would report a healthy line while the sites refuse to open.
    const cut = (tls ?? []).filter((check) => check.handshake === 'reset');

    if (cut.length > 0)
    {
        return { ...base, level: 'warn', cause: 'handshake-cut', blame: cut.map((c) => c.host) };
    }

    const shaky = alive.filter((t) =>
        (t.lossPercent ?? 0) > LOSS_LIMIT || (t.jitterMs ?? 0) > JITTER_LIMIT);

    if (shaky.length > 0)
    {
        return { ...base, level: 'warn', cause: 'unstable', blame: shaky.map((t) => t.name) };
    }

    return { ...base, level: 'ok', cause: 'none', blame: [] };
}

/** With the gateway proven alive, a dead internet is not the router's fault. */
function nothingWorks(rings: Rings | undefined): Cause
{
    if (rings?.gateway == null)
    {
        return 'link';
    }

    return rings.gateway.answer === 'silent' ? 'router' : 'provider';
}

/**
 * The pattern says names are the problem. Asking a resolver directly says whether the
 * lookup itself fails, answers with somebody else's address, or works fine while the
 * connections still do not.
 */
function nameTrouble(dns: DnsCheck | undefined): Cause
{
    if (dns === undefined)
    {
        return 'dns';
    }

    if (dns.agreement === 'sinkholed')
    {
        return 'sinkholed';
    }

    // Resolution works and the connections still fail, so the name is found and the
    // road to it is not. Something is dropping the traffic rather than the lookup.
    if (dns.agreement === 'agree' || dns.agreement === 'differ')
    {
        return 'filtered';
    }

    return 'dns';
}
