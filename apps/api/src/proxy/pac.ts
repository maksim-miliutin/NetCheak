/**
 * A browser pointed at a proxy sends everything through it, and almost none of it
 * needs to go. This is the file a browser reads instead: the hosts that needed a
 * different way of writing go through the proxy, everything else goes straight out.
 * Less of a person's traffic passing through this tool is the point, not more.
 */
export function buildPac(hosts: string[], port: number): string
{
    const wanted = [...new Set(hosts.map(clean).filter((host) => host !== ''))].sort();

    if (wanted.length === 0)
    {
        return 'function FindProxyForURL(url, host) { return "DIRECT"; }\n';
    }

    const list = wanted.map((host) => `        ${JSON.stringify(host)}`).join(',\n');

    return `// Written by netcheck. Only the hosts below go through the proxy; the rest
// of the browser's traffic never touches it.
function FindProxyForURL(url, host)
{
    var through = [
${list}
    ];

    for (var i = 0; i < through.length; i += 1)
    {
        // The host itself, or anything under it.
        if (host === through[i] || host.slice(-(through[i].length + 1)) === "." + through[i])
        {
            return "PROXY 127.0.0.1:${port}";
        }
    }

    return "DIRECT";
}
`;
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
