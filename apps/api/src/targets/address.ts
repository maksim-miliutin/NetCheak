import { isIP } from 'node:net';

export interface Address
{
    host: string;
    port: number;
}

export type Refusal =
    | 'empty'
    | 'bad-port'
    | 'bad-host'
    | 'too-long';

export type Parsed =
    | { ok: true; address: Address }
    | { ok: false; refusal: Refusal };

const DEFAULT_PORT = 443;

const MAX_HOST = 253;

const MAX_LABEL = 63;

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Whether a host is a literal address rather than a name. Node knows both families
 * already, including the shortened forms, the zone on a link-local address and the
 * mapped ::ffff: notation — none of which a regular expression here would get right.
 */
export function isAddress(host: string): boolean
{
    return isIP(host) !== 0;
}

/**
 * People paste what they have: a bare name, a whole address, something with a port on
 * the end. All three mean the same target, so all three are accepted and reduced to a
 * host and a port.
 */
export function parseTarget(input: string): Parsed
{
    const trimmed = input.trim();

    if (trimmed === '')
    {
        return { ok: false, refusal: 'empty' };
    }

    // A pasted address carries a scheme and often a path; only the authority matters.
    const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    const authority = withoutScheme.split('/')[0] ?? '';

    const [name, portText] = split(authority);

    if (portText !== null)
    {
        const port = Number(portText);

        if (!Number.isInteger(port) || port < 1 || port > 65535)
        {
            return { ok: false, refusal: 'bad-port' };
        }

        return finish(name, port);
    }

    return finish(name, DEFAULT_PORT);
}

export function looksLikeHost(host: string): boolean
{
    if (isAddress(host))
    {
        return true;
    }

    const labels = host.split('.');

    // Digits and dots and nothing else is somebody typing an address, so 1.1.1.256 is
    // a mistake rather than a name. Taking it as a name would send them looking for a
    // fault that is really a typo.
    if (labels.every((label) => /^\d+$/.test(label)))
    {
        return false;
    }

    // A single word resolves on some networks but names nothing on the internet, and
    // this tool asks the internet.
    return labels.length > 1 && labels.every((label) =>
        label.length > 0 && label.length <= MAX_LABEL && LABEL.test(label));
}

/**
 * Splits a host from its port. An address of the sixth version is full of colons, so
 * looking for the last one would cut 2001:db8::1 into a host and a port of 1. Written
 * out with a port it is bracketed, and that is the only place a colon separates.
 */
function split(authority: string): [string, string | null]
{
    if (authority.startsWith('['))
    {
        const close = authority.indexOf(']');

        if (close === -1)
        {
            return [authority, null];
        }

        const rest = authority.slice(close + 1);

        return [authority.slice(1, close), rest.startsWith(':') ? rest.slice(1) : null];
    }

    // Several colons and no brackets is an address written without a port.
    if (authority.indexOf(':') !== authority.lastIndexOf(':'))
    {
        return [authority, null];
    }

    const colon = authority.lastIndexOf(':');

    if (colon === -1)
    {
        return [authority, null];
    }

    return [authority.slice(0, colon), authority.slice(colon + 1)];
}

function finish(name: string, port: number): Parsed
{
    // A trailing dot is legal in a name and means nothing to a person, so it goes.
    const host = name.toLowerCase().replace(/\.$/, '');

    if (host.length > MAX_HOST)
    {
        return { ok: false, refusal: 'too-long' };
    }

    if (!looksLikeHost(host))
    {
        return { ok: false, refusal: 'bad-host' };
    }

    return { ok: true, address: { host, port } };
}
