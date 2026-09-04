import type { Words } from '../words';
import type
{
    DnsCheck,
    SpeedRow,
    TlsCheck,
} from '../types';

function describe(check: TlsCheck): string
{
    if (check.handshake === 'reset')
    {
        return 'the connection was cut during the handshake, which is what a filter '
            + 'reading the requested name looks like';
    }

    if (check.certificate === null)
    {
        return `no handshake (${check.handshake})`;
    }

    const named = check.certificate.matchesHost
        ? 'name matches'
        : 'NAME DOES NOT MATCH';

    return `signed by ${check.certificate.issuer}, ${named}, valid to ${check.certificate.validTo}`;
}

// Download and upload sit above the table because they answer a different question
// than reachability: not whether the line works, but how much of it there is.
export function Speed({ speed, say }: { speed: SpeedRow; say: Words })
{
    return (
        <section className="reading">
            <p className="speed">
                {speed.downloadMbps ?? '—'} Mbit/s {say.down},
                {' '}{speed.uploadMbps ?? '—'} Mbit/s {say.up}
            </p>
            <p className="small">
                {say.measuredAgainst(speed.source, speed.streams)}
            </p>
        </section>
    );
}

// Two resolvers asked the same name. Agreement is dull and worth one line; a
// disagreement is the whole reason the check exists.

// Two resolvers asked the same name. Agreement is dull and worth one line; a
// disagreement is the whole reason the check exists.
export function Dns({ check, say }: { check: DnsCheck; say: Words })
{
    const system = check.system;

    if (system === null)
    {
        return <p className="told small">{say.noResolver}</p>;
    }

    return (
        <section className="told">
            <p>{say.dns[check.agreement]}</p>
            <p className="small">
                {system.server} said {system.addresses.join(', ') || system.error},
                {' '}{check.reference.server} said {check.reference.addresses.join(', ')
                    || check.reference.error}
            </p>
        </section>
    );
}


// A handshake that completes says little on its own. Who signed the certificate says
// a great deal: an issuer nobody expected is what interception looks like from here.

// A handshake that completes says little on its own. Who signed the certificate says
// a great deal: an issuer nobody expected is what interception looks like from here.
export function Tls({ checks, say }: { checks: TlsCheck[]; say: Words })
{
    if (checks.length === 0)
    {
        return <p className="told small">{say.noNamedTargets}</p>;
    }

    return (
        <section className="told">
            {checks.map((check) => (
                <p key={check.host} className="small">
                    {check.host}: {describe(check)}
                </p>
            ))}
        </section>
    );
}
