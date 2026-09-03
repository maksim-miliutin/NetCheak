/**
 * Who may reach this machine, asked in one place by everything that has to know.
 *
 * The question was answered twice and differently: a lambda in a hook compared an
 * Origin header against a list, and the proxy answered by choosing an address to
 * listen on. Neither was a module — one was a place in a chain, the other a ternary —
 * and both were incomplete.
 */

/**
 * Loopback in every shape it arrives in. A connection from this machine reaches the
 * proxy as one of these, and which one depends on how the socket was opened.
 */
const LOOPBACK = /^(::1|::ffff:127\.|127\.)/;

/** The ranges that never leave a home or an office, whoever else is standing in it. */
const NEARBY =
[
    /^10\./,
    /^192\.168\./,
    /^169\.254\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
];

/**
 * Whether the page at this origin may ask this API.
 *
 * A request with no origin at all passes: that is a program on this machine, and a
 * program running as this user can already do everything this API does. Pretending
 * otherwise would be comfort rather than defence. What this refuses is the other
 * thing — a page on some other site, open in a tab, telling this machine to open
 * connections of its choosing.
 */
export function mayAsk(origin: string | undefined, allowed: ReadonlySet<string>): boolean
{
    return origin === undefined || allowed.has(origin);
}

/**
 * Whether a connection from this address may be relayed.
 *
 * Listening on every interface was the whole of the old answer, and on a machine with
 * a public address that is an open proxy facing the internet — not a phone on the
 * sofa. Near is near: this machine always, the local network when it was asked for,
 * and nothing else ever.
 */
export function mayRelay(from: string | undefined, onNetwork: boolean): boolean
{
    if (from === undefined || from === '')
    {
        return false;
    }

    if (LOOPBACK.test(from))
    {
        return true;
    }

    if (!onNetwork)
    {
        return false;
    }

    const plain = from.replace(/^::ffff:/, '');

    return NEARBY.some((range) => range.test(plain));
}
