import { useCallback, useEffect, useRef, useState } from 'react';
import
{
    forgetTarget,
    getHistory,
    getReport,
    getStatus,
    getTunnels,
    runCheck,
    runDns,
    runSpeed,
    runTls,
    traceTo,
    watchTarget,
} from './api';
import { EVERY_MS, isDue, nextInSeconds } from './watch';
import { ceilingOf, plot } from './trace';
import { pickTongue, WORDS, type Words } from './words';
import { showStamp } from './when';
import type
{
    DnsCheck,
    History,
    SpeedRow,
    Trace,
    Tunnels,
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
    const [history, setHistory] = useState<History[]>([]);
    const [tunnels, setTunnels] = useState<Tunnels | null>(null);
    const [watching, setWatching] = useState(true);
    const [finishedAt, setFinishedAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [opened, setOpened] = useState<string | null>(null);
    const [traces, setTraces] = useState<Record<number, Trace | 'running'>>({});
    const [copied, setCopied] = useState(false);
    const [tongue, setTongue] = useState(() => pickTongue(navigator.languages ?? ['en']));

    const say = WORDS[tongue];
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () =>
    {
        try
        {
            const [next, past, through] = await Promise.all(
                [getStatus(), getHistory(), getTunnels()]);

            setStatus(next);
            setHistory(past.targets);
            setTunnels(through);
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

    // The timer only ticks; whether a run is due is decided by a rule that can be
    // tested without waiting five minutes for it. The reference is filled in below,
    // because hooks have to be declared before the early return and the handler is
    // written after it.
    const latest = useRef<(() => Promise<void>) | null>(null);

    useEffect(() =>
    {
        const tick = setInterval(() => setNow(Date.now()), 1000);

        return () => clearInterval(tick);
    }, []);

    useEffect(() =>
    {
        const due = isDue(
        {
            sinceMs: finishedAt === null ? null : now - finishedAt,
            busy: step !== null || measuring,
            hidden: document.hidden,
            enabled: watching,
        });

        if (due && finishedAt !== null && latest.current !== null)
        {
            void latest.current();
        }
    }, [now, finishedAt, step, measuring, watching]);

    if (!loaded)
    {
        return <p>{say.loading}</p>;
    }



    // Somebody whose page will not open should not have to guess which check answers
    // that. One button walks the chain in the order the traffic does.
    const runAll = async (): Promise<void> =>
    {
        try
        {
            setStep(say.connecting);
            await runCheck();

            setStep(say.askingResolvers);
            setDns(await runDns());

            setStep(say.readingCertificates);

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
            setFinishedAt(Date.now());
        }
    };

    latest.current = runAll;


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

    const trace = async (id: number, host: string): Promise<void> =>
    {
        setTraces((current) => ({ ...current, [id]: 'running' }));

        try
        {
            const found = await traceTo(host);

            setTraces((current) => ({ ...current, [id]: found }));
        }
        catch (err)
        {
            setTraces((current) =>
            {
                const without = { ...current };
                delete without[id];

                return without;
            });

            setError((err as Error).message);
        }
    };

    // Written out for a support desk, where somebody who will never open this tool has
    // to be able to read it.
    const copyReport = async (): Promise<void> =>
    {
        try
        {
            await navigator.clipboard.writeText(await getReport());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch (err)
        {
            setError((err as Error).message);
        }
    };

    const busy = measuring || step !== null;

    return (
        <div data-state={status?.verdict.level ?? 'unknown'}>
            <div className="band">
                <div className="inner">
                    <header className="masthead">
                        <b>netcheck</b>

                        <span>
                            {status?.targets[0]?.checkedAt === undefined
                                || status.targets[0].checkedAt === null
                                ? say.notCheckedYet
                                : showStamp(status.targets[0].checkedAt, tongue)}

                            {/* The browser is asked first, and a person whose machine
                                is set to one language while they read another can say
                                so without hunting for a setting. */}
                            <button
                                type="button"
                                className="tongue"
                                onClick={() => setTongue(tongue === 'ru' ? 'en' : 'ru')}
                            >
                                {tongue === 'ru' ? 'EN' : 'RU'}
                            </button>
                        </span>
                    </header>

                    {status !== null && <Headline verdict={status.verdict} say={say} />}

                    {status !== null && (
                        <Chain
                            cause={status.verdict.cause}
                            say={say}
                            has={{ Names: dns !== null, Connections: tls !== null }}
                            opened={opened}
                            onOpen={(link) => setOpened(opened === link ? null : link)}
                        />
                    )}

                    {opened === 'Names' && dns !== null && <Dns check={dns} say={say} />}
                    {opened === 'Connections' && tls !== null && <Tls checks={tls} say={say} />}
                </div>
            </div>

            <main className="sheet">

            <div className="actions">
                <button type="button" className="primary" onClick={runAll} disabled={busy}>
                    {say.runChecks}
                </button>

                {/* Speed stands apart: it takes ten seconds and spends real traffic,
                    which is not something to do on every visit. */}
                <button type="button" onClick={speed} disabled={busy}>
                    {say.measureSpeed}
                </button>

                <button type="button" onClick={copyReport} disabled={busy}>
                    {copied ? say.copied : say.copyReport}
                </button>

                <label className="repeat">
                    <input
                        type="checkbox"
                        checked={watching}
                        onChange={(event) => setWatching(event.target.checked)}
                    />
                    {say.keepChecking}
                    {watching && step === null && finishedAt !== null && (
                        <span className="countdown">
                            {nextInSeconds(now - finishedAt, EVERY_MS)}s
                        </span>
                    )}
                </label>
            </div>



            {step !== null && <p className="progress small">{step}…</p>}

            {/* The transfer runs for about ten seconds. Without a word about it the
                page looks stuck, and people click the button again. */}
            {measuring && (
                <p className="reading small">{say.pullingData}…</p>
            )}

            {error !== null && <p className="error">{error}</p>}

            {/* A tunnel changes which road the traffic takes, and a check that looks
                strange often looks that way because it left through one. */}
            {tunnels !== null && tunnels.tunnelling.length > 0 && (
                <p className="reading small">
                    {say.throughTunnel(tunnels.tunnelling.join(', '))}
                </p>
            )}

            {status?.speed != null && <Speed speed={status.speed} say={say} />}

            <ul className="lanes">
                    {(status?.targets ?? []).map((target) => (
                        <Lane
                            key={target.targetId}
                            target={target}
                            past={history.find((h) => h.targetId === target.targetId) ?? null}
                            say={say}
                            trace={traces[target.targetId] ?? null}
                            onTrace={trace}
                            forget={forget}
                        />
                    ))}
            </ul>

            <div className="watch">
                <input
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && void watch()}
                    placeholder={say.watchAddress}
                    aria-label="Address to watch"
                />
                <button type="button" onClick={watch} disabled={typed.trim() === ''}>
                    {say.watch}
                </button>
            </div>
            </main>
        </div>
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

function Chain({ cause, say, has, opened, onOpen }:
{
    cause: Verdict['cause'];
    say: Words;
    has: Partial<Record<Link, boolean>>;
    opened: string | null;
    onOpen: (link: Link) => void;
})
{
    const broken = BREAKS[cause];
    const stops = broken === null ? CHAIN.length : CHAIN.indexOf(broken);

    return (
        <ol className="chain" aria-label="where the check reached">
            {CHAIN.map((link, index) =>
            {
                const shape = state(index, stops, cause);

                // A link with something to say becomes the way to say it: the detail
                // belongs where a reader goes looking for it, not in a heap below.
                if (has[link] !== true)
                {
                    return <li key={link} className={shape}>{say.chain[link]}</li>;
                }

                return (
                    <li key={link} className={`${shape} tellable`}>
                        <button
                            type="button"
                            onClick={() => onOpen(link)}
                            aria-expanded={opened === link}
                        >
                            {say.chain[link]}
                        </button>
                    </li>
                );
            })}
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
function Headline({ verdict, say }: { verdict: Verdict; say: Words })
{
    const said = say.said[verdict.cause];

    return (
        <>
            <h1>{said.headline}</h1>
            <p className="lead">{said.detail(verdict)}</p>

            {say.next[verdict.cause].length > 0 && (
                <ul className="steps">
                    {say.next[verdict.cause].map((step) => <li key={step}>{step}</li>)}
                </ul>
            )}
        </>
    );
}



// Download and upload sit above the table because they answer a different question
// than reachability: not whether the line works, but how much of it there is.
function Speed({ speed, say }: { speed: SpeedRow; say: Words })
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
function Dns({ check, say }: { check: DnsCheck; say: Words })
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
function Tls({ checks, say }: { checks: TlsCheck[]; say: Words })
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

const LANE_WIDTH = 640;
const LANE_HEIGHT = 40;

/**
 * A lane per target, its history drawn as a trace across the sheet. The tool has been
 * sampling over time since the first version; showing a moment instead of the run of
 * it threw most of what it knows away.
 */
function Lane({ target, past, say, trace, onTrace, forget }:
{
    target: StatusRow;
    say: Words;
    past: History | null;
    trace: Trace | 'running' | null;
    onTrace: (id: number, host: string) => void;
    forget: (id: number) => void;
})
{
    const runs = past?.runs ?? [];
    const { line, gaps } = plot(runs, ceilingOf(runs), LANE_WIDTH, LANE_HEIGHT);

    return (
        <li className="lane">
            <div className="label">
                <span className="name">
                    {target.name}

                    {/* A target somebody typed in is named after its own address, and
                        printing both would say the same thing twice. */}
                    {target.name !== target.host
                        && <span className="host">{target.host}</span>}
                </span>
                <button
                    type="button"
                    className="forget"
                    onClick={() => forget(target.targetId)}
                    aria-label={`Stop watching ${target.name}`}
                >
                    {say.remove}
                </button>
            </div>

            <svg
                className="trace"
                viewBox={`0 0 ${LANE_WIDTH} ${LANE_HEIGHT}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`${target.name}: ${runs.length} checks kept`}
            >
                {line !== '' && <polyline className="ink" points={line} />}

                {gaps.map((x, index) => (
                    <line key={index} className="gap" x1={x} y1="0" x2={x} y2={LANE_HEIGHT} />
                ))}
            </svg>

            <div className="numbers">
                <span>{say.loss} <b>{format(target.lossPercent, '%')}</b></span>
                <span>{say.average} <b>{format(target.averageMs, ' ms')}</b></span>
                <span>{say.jitter} <b>{format(target.jitterMs, ' ms')}</b></span>
                <button
                    type="button"
                    className="ghost"
                    onClick={() => onTrace(target.targetId, target.host)}
                    disabled={trace === 'running'}
                >
                    {trace === 'running' ? say.tracing : say.tracePath}
                </button>

                {runs.length > 0
                    && <span className="kept">{say.checksKept(runs.length)}</span>}
            </div>

            {trace !== null && trace !== 'running' && <Path trace={trace} say={say} />}
        </li>
    );
}

/**
 * The hops between here and there. The layered checks say the far end is silent; this
 * says where along the way it went quiet, which is the one thing they cannot.
 */
function Path({ trace, say }: { trace: Trace; say: Words })
{
    if (trace.error !== null)
    {
        return <p className="path small">{trace.error}</p>;
    }

    if (trace.hops.length === 0)
    {
        return <p className="path small">{say.emptyTrace}</p>;
    }

    return (
        <ol className="path">
            {trace.hops.map((hop) => (
                <li key={hop.number} className={quiet(hop, trace.silentFrom)}>
                    <span className="where">{hop.address ?? '—'}</span>
                    <span className="took">{best(hop.times)}</span>
                </li>
            ))}
        </ol>
    );
}

function quiet(hop: { number: number; times: (number | null)[] }, from: number | null): string
{
    if (from !== null && hop.number >= from)
    {
        return 'hop silent';
    }

    return hop.times.every((time) => time === null) ? 'hop passing' : 'hop';
}

/** The quickest of the probes, since the slow one is usually the router being busy. */
function best(times: (number | null)[]): string
{
    const answered = times.filter((time): time is number => time !== null);

    return answered.length === 0 ? '—' : `${Math.min(...answered)} ms`;
}





function format(value: number | null, unit: string): string
{
    return value === null ? '—' : `${Math.round(value * 10) / 10}${unit}`;
}
