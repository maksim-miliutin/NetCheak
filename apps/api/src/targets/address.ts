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

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

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
    if (IPV4.test(host))
    {
        return host.split('.').every((part) => Number(part) <= 255);
    }

    const labels = host.split('.');

    // A single word resolves on some networks but names nothing on the internet, and
    // this tool asks the internet.
    return labels.length > 1 && labels.every((label) =>
        label.length > 0 && label.length <= MAX_LABEL && LABEL.test(label));
}

function split(authority: string): [string, string | null]
{
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
