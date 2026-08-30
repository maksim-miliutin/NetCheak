export interface Relay
{
    way: string;
    port: number;
}

export interface Routed
{
    host: string;
    /** The port whose way got this host through, or the first one running. */
    port: number;
}

/**
 * A browser pointed at a proxy sends everything through it, and almost none of it
 * needs to go. This is the file a browser reads instead: the hosts that needed a
 * different way of writing go to the port whose way worked for them, everything else
 * goes straight out. Less of a person's traffic passing through this tool is the
 * point, not more.
 */
export function buildPac(routed: (string | Routed)[], relays: Relay[]): string
{
    const fallback = relays[0]?.port ?? 3128;
    const wanted = tidy(routed, fallback);

    if (wanted.length === 0)
    {
        return 'function FindProxyForURL(url, host) { return "DIRECT"; }\n';
    }

    const list = wanted
        .map((one) => `        [${JSON.stringify(one.host)}, ${one.port}]`)
        .join(',\n');

    return `// Written by netcheck. Only the hosts below go through a proxy, each to the
// port whose way of writing got it through; the rest of the browser's traffic never
// touches this tool.
function FindProxyForURL(url, host)
{
    var through = [
${list}
    ];

    for (var i = 0; i < through.length; i += 1)
    {
        var name = through[i][0];

        // The host itself, or anything under it.
        if (host === name || host.slice(-(name.length + 1)) === "." + name)
        {
            return "PROXY 127.0.0.1:" + through[i][1];
        }
    }

    return "DIRECT";
}
`;
}

/** One entry per host, named once, each with the port that serves it. */
function tidy(routed: (string | Routed)[], fallback: number): Routed[]
{
    const seen = new Map<string, number>();

    for (const one of routed)
    {
        const host = clean(typeof one === 'string' ? one : one.host);

        if (host !== '' && !seen.has(host))
        {
            seen.set(host, typeof one === 'string' ? fallback : one.port);
        }
    }

    return [...seen].map(([host, port]) => ({ host, port })).sort((a, b) =>
        a.host < b.host ? -1 : 1);
}

/** A host as a browser will present it: no scheme, no port, lower case. */
export function clean(host: string): string
{
    return host
        .trim()
        .toLowerCase()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
        .replace(/[:/].*$/, '')
        .replace(/\.$/, '');
}
