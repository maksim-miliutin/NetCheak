import { useCallback, useEffect, useState } from 'react';
import { getStatus, runCheck, runDns, runSpeed } from './api';
import type { DnsCheck, SamplePoint, SpeedRow, Status, StatusRow, Verdict } from './types';

export function App()
{
    const [status, setStatus] = useState<Status | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const [measuring, setMeasuring] = useState(false);
    const [dns, setDns] = useState<DnsCheck | null>(null);
    const [asking, setAsking] = useState(false);
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

    const check = async (): Promise<void> =>
    {
        setRunning(true);

        try
        {
            await runCheck();
            await load();
        }
        catch (err)
        {
            setError((err as Error).message);
        }
        finally
        {
            setRunning(false);
        }
    };

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

    const lookup = async (): Promise<void> =>
    {
        setAsking(true);

        try
        {
            setDns(await runDns());
        }
        catch (err)
        {
            setError((err as Error).message);
        }
        finally
        {
            setAsking(false);
        }
    };

    return (
        <>
            {status !== null && <Headline verdict={status.verdict} />}

            <button type="button" onClick={check} disabled={running || measuring}>
                Check connection
            </button>
            <button type="button" onClick={speed} disabled={measuring || running || asking}>
                Measure speed
            </button>
            <button type="button" onClick={lookup} disabled={asking || running || measuring}>
                Check DNS
            </button>

            {/* The transfer runs for about ten seconds. Without a word about it the
                page looks stuck, and people click the button again. */}
            {measuring && <p className="small">Pulling and pushing data, about ten seconds…</p>}
            {running && <p className="small">Connecting to each target…</p>}

            {error !== null && <p className="error">{error}</p>}

            {status?.speed != null && <Speed speed={status.speed} />}

            {dns !== null && <Dns check={dns} />}

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
                        />
                    ))}
                </tbody>
            </table>

            <p className="small">Last checked: {status?.targets[0]?.checkedAt ?? 'never'}</p>
        </>
    );
}

// The point of the tool is the sentence, not the table: the table is the evidence
// underneath it.
function Headline({ verdict }: { verdict: Verdict })
{
    const said = SAID[verdict.cause];

    return (
        <>
            <h1>{said.headline}</h1>
            <p>{said.detail(verdict)}</p>
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
        <p className="speed">
            {speed.downloadMbps ?? '—'} Mbit/s down, {speed.uploadMbps ?? '—'} Mbit/s up
            <br />
            <span className="small">
                measured against {speed.source} over {speed.streams} connections
            </span>
        </p>
    );
}

// Two resolvers asked the same name. Agreement is dull and worth one line; a
// disagreement is the whole reason the check exists.
function Dns({ check }: { check: DnsCheck })
{
    const system = check.system;

    if (system === null)
    {
        return <p className="small">No system resolver could be read.</p>;
    }

    return (
        <p>
            {DNS_SAID[check.agreement]}
            <br />
            <span className="small">
                {system.server} said {system.addresses.join(', ') || system.error},
                {' '}{check.reference.server} said {check.reference.addresses.join(', ')
                    || check.reference.error}
            </span>
        </p>
    );
}

const DNS_SAID: Record<DnsCheck['agreement'], string> =
{
    'agree': 'Your resolver answers the same as a public one.',
    'differ': 'Your resolver returns a different address than a public one does. '
        + 'Something between you and the name is rewriting the answer.',
    'system-fails': 'Your resolver cannot answer, while a public one can. '
        + 'Changing the DNS server would fix this.',
    'public-fails': 'Your resolver answers and the public one does not, which usually '
        + 'means the public one is blocked rather than broken.',
    'both-fail': 'Neither resolver answered, so the name itself may be gone.',
    'unknown': 'No system resolver could be read.',
};

function Row({ target, blamed }: { target: StatusRow; blamed: boolean })
{
    return (
        <tr>
            <td>
                {target.name} <span className="host">{target.host}</span>
            </td>
            <td>{format(target.lossPercent, '%')}</td>
            <td>{format(target.averageMs, ' ms')}</td>
            <td>{format(target.jitterMs, ' ms')}</td>
            <td><Attempts samples={target.samples} /></td>
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
