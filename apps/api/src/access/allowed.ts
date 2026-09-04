/**
 * Who may reach this machine. It was answered twice and differently: a lambda in a
 * hook against an Origin header, and a proxy choosing an address to listen on.
 */

// Loopback in every shape it arrives in, which depends on how the socket was opened.
const LOOPBACK = /^(::1|::ffff:127\.|127\.)/;

export function isLoopback(from: string | undefined): boolean
{
    return from !== undefined && LOOPBACK.test(from);
}

// The ranges that never leave a home or an office.
const NEARBY =
[
    /^10\./,
    /^192\.168\./,
    /^169\.254\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
];

// No origin passes: a program running as this user can already do everything this
// API does, and refusing it would be comfort rather than defence.
export function mayAsk(origin: string | undefined, allowed: ReadonlySet<string>): boolean
{
    return origin === undefined || allowed.has(origin);
}

// Every interface was the whole of the old answer, and on a machine with a public
// address that is an open proxy facing the internet.
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
