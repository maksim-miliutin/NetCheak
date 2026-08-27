import { useCallback, useEffect, useState } from 'react';
import { forgetTarget, getStatus, runCheck, runDns, runSpeed, runTls, watchTarget } from './api';
import type
{
    DnsCheck,
    SamplePoint,
    SpeedRow,
    Status,
    StatusRow,
    TlsCheck,
    Verdict,
} from './types';

export function App()
{
    const [status, setStatus] = useState<Status | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [measuring, setMeasuring] = useState(false);
    const [dns, setDns] = useState<DnsCheck | null>(null);
    const [tls, setTls] = useState<TlsCheck[] | null>(null);
    const [step, setStep] = useState<string | null>(null);
    const [typed, setTyped] = useState('');
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () =>
    {
        try
        {
            setStatus(await getStatus());
            setError(null);
        }
        catch (err)
        {
            setError((err as Error).message);
        }
        finally
        {
            setLoaded(true);
        }
    }, []);

    useEffect(() =>
    {
        void load();
    }, [load]);


    const speed = async (): Promise<void> =>
    {
        setMeasuring(true);

        try
        {
            await runSpeed();
            await load();
        }
        catch (err)
        {
            setError((err as Error).message);
        }
        finally
        {
            setMeasuring(false);
        }
    };

    if (!loaded)
    {
        return <p>Loading…</p>;
    }



    // Somebody whose page will not open should not have to guess which check answers
    // that. One button walks the chain in the order the traffic does.
    const runAll = async (): Promise<void> =>
    {
        try
        {
            setStep('Connecting to each target');
            await runCheck();

            setStep('Asking two resolvers the same name');
            setDns(await runDns());

            setStep('Reading certificates');

            const result = await runTls();

            setTls(result.checks);
            await load();
            setStatus((current) => current === null
                ? current
                : { ...current, verdict: result.verdict });

            setError(null);
        }
        catch (err)
        {
            setError((err as Error).message);
        }
        finally
        {
            setStep(null);
        }
    };

    const watch = async (): Promise<void> =>
    {
        try
        {
            await watchTarget(typed);
            setTyped('');
            await load();
        }
        catch (err)
        {
            setError((err as Error).message);
        }
    };

    const forget = async (id: number): Promise<void> =>
    {
        try
        {
            await forgetTarget(id);
            await load();
        }
        catch (err)
        {
            setError((err as Error).message);
        }
    };

    const busy = measuring || step !== null;

    return (
        <>
            <header className="masthead">
                <b>netcheck</b>
                <span>{status?.targets[0]?.checkedAt ?? 'not checked yet'}</span>
            </header>

            {status !== null && <Chain cause={status.verdict.cause} />}

            {status !== null && <Headline verdict={status.verdict} />}

            <div className="actions">
                <button type="button" className="primary" onClick={runAll} disabled={busy}>
                    Run the checks
                </button>

                {/* Speed stands apart: it takes ten seconds and spends real traffic,
                    which is not something to do on every visit. */}
                <button type="button" onClick={speed} disabled={busy}>
                    Measure speed
                </button>
            </div>

            {step !== null && <p className="reading small">{step}…</p>}

            {/* The transfer runs for about ten seconds. Without a word about it the
                page looks stuck, and people click the button again. */}
            {measuring && (
                <p className="reading small">Pulling and pushing data, about ten seconds…</p>
            )}

            {error !== null && <p className="error">{error}</p>}

            {status?.speed != null && <Speed speed={status.speed} />}

            {dns !== null && <Dns check={dns} />}

            {tls !== null && <Tls checks={tls} />}

            <table>
                <thead>
                    <tr>
                        <th>Target</th>
                        <th>Loss</th>
                        <th>Average</th>
                        <th>Jitter</th>
                        <th>Attempts</th>
                    </tr>
                </thead>
                <tbody>
                    {(status?.targets ?? []).map((target) => (
                        <Row
                            key={target.targetId}
                            target={target}
                            blamed={status?.verdict.blame.includes(target.name) ?? false}
                            forget={forget}
                        />
                    ))}
                </tbody>
            </table>

            <div className="watch">
                <input
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && void watch()}
                    placeholder="Watch another address"
                    aria-label="Address to watch"
                />
                <button type="button" onClick={watch} disabled={typed.trim() === ''}>
                    Watch
                </button>
            </div>
        </>
    );
}

// The tool follows a chain: this machine, the router, the line past it, the names,
// then the connections themselves. Every verdict is a statement about where that
// chain stops, so the chain is drawn and the break marked on it.
const CHAIN = ['This machine', 'Router', 'Provider', 'Names', 'Connections'] as const;

type Link = (typeof CHAIN)[number];

const BREAKS: Record<Verdict['cause'], Link | null> =
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

function Chain({ cause }: { cause: Verdict['cause'] })
{
    const broken = BREAKS[cause];
    const stops = broken === null ? CHAIN.length : CHAIN.indexOf(broken);

    return (
        <ol className="chain" aria-label="where the check reached">
            {CHAIN.map((link, index) => (
                <li
                    key={link}
                    className={state(index, stops, cause)}
                >
                    {link}
                </li>
            ))}
        </ol>
    );
}

function state(index: number, stops: number, cause: Verdict['cause']): string
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

// The point of the tool is the sentence, not the table: the table is the evidence
// underneath it.
function Headline({ verdict }: { verdict: Verdict })
{
    const said = SAID[verdict.cause];

    return (
        <>
            <h1>{said.headline}</h1>
            <p className="lead">{said.detail(verdict)}</p>
        </>
    );
}

const SAID: Record<Verdict['cause'], { headline: string; detail: (v: Verdict) => string }> =
{
    'none':
    {
        headline: 'Your connection is fine',
        detail: (v) => `All ${v.total} targets answered, losing nothing.`,
    },
    'never-checked':
    {
        headline: 'Nothing measured yet',
        detail: () => 'Run a check to see where the connection stands.',
    },
    'link':
    {
        headline: 'Nothing is reachable',
        detail: () => 'Even raw addresses stayed silent, so the problem is at your end. '
            + 'The router could not be reached to narrow it down further.',
    },
    'router':
    {
        headline: 'The router is not answering',
        detail: () => 'Nothing beyond this machine replied, and neither did the gateway. '
            + 'Check the cable and the router itself before blaming the provider.',
    },
    'provider':
    {
        headline: 'The line past the router is down',
        detail: () => 'The router answers, so the cable and the box are fine. Nothing '
            + 'beyond it replies, which puts the fault with the provider.',
    },
    'dns':
    {
        headline: 'Names do not resolve',
        detail: (v) => `Addresses answer, ${list(v.blame)} do not. Packets travel; `
            + 'it is the lookup that fails. Changing the DNS server usually fixes it.',
    },
    'sinkholed':
    {
        headline: 'Something is standing in for these names',
        detail: (v) => `${list(v.blame)} resolve to an address nobody can route to, so `
            + 'the answer did not come from the site. A different DNS server usually '
            + 'gets around it.',
    },
    'filtered':
    {
        headline: 'The names resolve and still will not open',
        detail: (v) => `${list(v.blame)} are found by the resolver, so the lookup is `
            + 'fine. The connection itself is what fails, which means changing DNS '
            + 'would not help.',
    },
    'handshake-cut':
    {
        headline: 'The connection opens and is cut',
        detail: (v) => `${list(v.blame)} accept a connection and then sever it during `
            + 'the handshake. Nothing is lost on the way, which is why the numbers '
            + 'below look healthy.',
    },
    'remote':
    {
        headline: 'Your connection works',
        detail: (v) => `${list(v.blame)} did not answer while the rest did, so the outage `
            + 'is on their side, not yours.',
    },
    'unstable':
    {
        headline: 'The connection is unsteady',
        detail: (v) => `${list(v.blame)} answered, but with losses or wandering latency. `
            + 'Calls and games will stutter; pages will mostly load.',
    },
};

// Download and upload sit above the table because they answer a different question
// than reachability: not whether the line works, but how much of it there is.
function Speed({ speed }: { speed: SpeedRow })
{
    return (
        <section className="reading">
            <p className="speed">
                {speed.downloadMbps ?? '—'} Mbit/s down, {speed.uploadMbps ?? '—'} Mbit/s up
            </p>
            <p className="small">
                measured against {speed.source} over {speed.streams} connections
            </p>
        </section>
    );
}

// Two resolvers asked the same name. Agreement is dull and worth one line; a
// disagreement is the whole reason the check exists.
function Dns({ check }: { check: DnsCheck })
{
    const system = check.system;

    if (system === null)
    {
        return <p className="reading small">No system resolver could be read.</p>;
    }

    return (
        <section className="reading">
            <p>{DNS_SAID[check.agreement]}</p>
            <p className="small">
                {system.server} said {system.addresses.join(', ') || system.error},
                {' '}{check.reference.server} said {check.reference.addresses.join(', ')
                    || check.reference.error}
            </p>
        </section>
    );
}

const DNS_SAID: Record<DnsCheck['agreement'], string> =
{
    'agree': 'Your resolver answers the same as a public one.',
    'sinkholed': 'Your resolver points this name at an address nobody can route to. '
        + 'That answer did not come from the site: something is standing in for it.',
    'differ': 'Your resolver returns a different address than a public one does. '
        + 'Often that is just a content network handing out a nearer server, so this '
        + 'is worth a look rather than a conclusion.',
    'system-fails': 'Your resolver cannot answer, while a public one can. '
        + 'Changing the DNS server would fix this.',
    'public-fails': 'Your resolver answers and the public one does not, which usually '
        + 'means the public one is blocked rather than broken.',
    'both-fail': 'Neither resolver answered, so the name itself may be gone.',
    'unknown': 'No system resolver could be read.',
};

// A handshake that completes says little on its own. Who signed the certificate says
// a great deal: an issuer nobody expected is what interception looks like from here.
function Tls({ checks }: { checks: TlsCheck[] })
{
    if (checks.length === 0)
    {
        return <p className="reading small">No named targets to check.</p>;
    }

    return (
        <section className="reading">
            {checks.map((check) => (
                <p key={check.host} className="small">
                    {check.host}: {describe(check)}
                </p>
            ))}
        </section>
    );
}

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

function Row({ target, blamed, forget }:
{
    target: StatusRow;
    blamed: boolean;
    forget: (id: number) => void;
})
{
    return (
        <tr>
            <td>
                {target.name} <span className="host">{target.host}</span>
                <button
                    type="button"
                    className="forget"
                    onClick={() => forget(target.targetId)}
                    aria-label={`Stop watching ${target.name}`}
                >
                    remove
                </button>
            </td>
            <td data-label="Loss">{format(target.lossPercent, '%')}</td>
            <td data-label="Average">{format(target.averageMs, ' ms')}</td>
            <td data-label="Jitter">{format(target.jitterMs, ' ms')}</td>
            <td data-label="Attempts">
                <Attempts samples={target.samples} />
            </td>
        </tr>
    );
}

// Five steady replies and four fast ones plus a timeout share an average, so every
// attempt is drawn instead.
function Attempts({ samples }: { samples: SamplePoint[] })
{
    if (samples.length === 0)
    {
        return <span className="host">—</span>;
    }

    const slowest = Math.max(...samples.map((s) => s.latencyMs ?? 0), 1);

    return (
        <span className="bars">
            {samples.map((sample, index) => (
                <i
                    key={index}
                    className={sample.reachable ? 'bar' : 'bar lost'}
                    style={{ height: barHeight(sample, slowest) }}
                    title={sample.reachable ? `${sample.latencyMs} ms` : 'no answer'}
                />
            ))}
        </span>
    );
}

function barHeight(sample: SamplePoint, slowest: number): string
{
    const share = (sample.latencyMs ?? slowest) / slowest;

    return `${Math.max(3, share * 16)}px`;
}

function list(names: string[]): string
{
    if (names.length <= 1)
    {
        return names[0] ?? 'nothing';
    }

    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function format(value: number | null, unit: string): string
{
    return value === null ? '—' : `${Math.round(value * 10) / 10}${unit}`;
}
