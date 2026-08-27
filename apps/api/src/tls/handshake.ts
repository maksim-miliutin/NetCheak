import { connect, type PeerCertificate } from 'node:tls';

export type Handshake =
    | 'completed'
    | 'reset'
    | 'refused'
    | 'timeout'
    | 'rejected';

export interface Certificate
{
    issuer: string;
    subject: string;
    names: string[];
    validTo: string;
    matchesHost: boolean;
}

export interface TlsCheck
{
    host: string;
    port: number;
    handshake: Handshake;
    ms: number | null;
    certificate: Certificate | null;
    error: string | null;
}

const TIMEOUT_MS = 4000;

/**
 * A connection cut during the handshake, rather than refused before it, is the shape
 * traffic takes when something on the way reads the requested name and objects to it.
 */
export function readHandshake(code: string | undefined): Handshake
{
    if (code === 'ECONNRESET')
    {
        return 'reset';
    }

    if (code === 'ECONNREFUSED')
    {
        return 'refused';
    }

    if (code === 'ETIMEDOUT' || code === 'ERR_SOCKET_CONNECTION_TIMEOUT')
    {
        return 'timeout';
    }

    return 'rejected';
}

/** Collects every name a certificate claims, from the subject and the alternates. */
export function certificateNames(certificate: PeerCertificate): string[]
{
    const alternates = (certificate.subjectaltname ?? '')
        .split(',')
        .map((entry) => entry.trim().replace(/^DNS:/, ''))
        .filter((entry) => entry !== '');

    // A certificate may carry several common names, and node hands those back as an
    // array rather than a string.
    const common = certificate.subject?.CN;
    const carried = common === undefined ? [] : [common].flat();

    return [...new Set([...carried, ...alternates])];
}

/**
 * Matches a host against certificate names. A wildcard covers one label and only the
 * leftmost one: *.example.com is example.com's subdomains, not its sub-subdomains,
 * and not example.com itself.
 */
export function matchesHost(host: string, names: string[]): boolean
{
    const wanted = host.toLowerCase();

    return names.some((name) =>
    {
        const claim = name.toLowerCase();

        if (claim === wanted)
        {
            return true;
        }

        if (!claim.startsWith('*.'))
        {
            return false;
        }

        const tail = claim.slice(1);

        return wanted.endsWith(tail) && !wanted.slice(0, -tail.length).includes('.');
    });
}

export function inspectTls(host: string, port = 443): Promise<TlsCheck>
{
    return new Promise((resolve) =>
    {
        const started = performance.now();
        let settled = false;

        // The certificate is read rather than trusted: a name that does not match, or an
        // issuer nobody expected, is exactly what this check exists to notice.
        const socket = connect({ host, port, servername: host, rejectUnauthorized: false });

        const finish = (check: Omit<TlsCheck, 'host' | 'port'>): void =>
        {
            if (settled)
            {
                return;
            }

            settled = true;
            socket.destroy();
            resolve({ host, port, ...check });
        };

        socket.setTimeout(TIMEOUT_MS);

        socket.once('secureConnect', () =>
        {
            const peer = socket.getPeerCertificate();
            const names = certificateNames(peer);

            finish({
                handshake: 'completed',
                ms: Math.round(performance.now() - started),
                certificate:
                {
                    issuer: [peer.issuer?.O ?? peer.issuer?.CN ?? 'unknown'].flat().join(', '),
                    subject: [peer.subject?.CN ?? 'unknown'].flat().join(', '),
                    names,
                    validTo: peer.valid_to ?? '',
                    matchesHost: matchesHost(host, names),
                },
                error: null,
            });
        });

        socket.once('timeout', () => finish(
        {
            handshake: 'timeout',
            ms: null,
            certificate: null,
            error: 'timeout',
        }));

        socket.once('error', (error: NodeJS.ErrnoException) => finish(
        {
            handshake: readHandshake(error.code),
            ms: null,
            certificate: null,
            error: error.code ?? error.message,
        }));
    });
}
