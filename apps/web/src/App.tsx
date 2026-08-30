import { useCallback, useEffect, useRef, useState } from 'react';
import
{
    forgetTarget,
    getHistory,
    getReport,
    getStatus,
    findCut,
    toggleProxy,
    tryEvasion,
    getNeighbours,
    checkUpdate,
    getOutbound,
    getProxy,
    getTunnels,
    checkSixth,
    measureMtu,
    runCheck,
    runDns,
    runSpeed,
    runTls,
    traceTo,
    watchTarget,
} from './api';
import { EVERY_MS, isDue, nextInSeconds } from './watch';
import { ceilingOf, plot } from './trace';
import { answerFor, useLookup } from './lookup';
import
{
    bestOf,
    bookmarklet,
    CHAIN,
    format,
    hopState,
    linkState,
    readEvasion,
    readSize,
    readTrace,
    stopsAt,
    type Link,
} from './page';
import { pickTongue, WORDS, type Words } from './words';
import { showStamp } from './when';
import type
{
    DnsCheck,
    History,
    SpeedRow,
    Path,
    Cut,
    Evasion,
    Household,
    Newer,
    Outbound,
    ProxyState,
    SixthCheck,
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
    const [sixth, setSixth] = useState<SixthCheck | null>(null);

    // One shape, asked four ways. Written out separately they drifted: each was
    // twenty lines of which one was its own.
    const traces = useLookup<Trace>(traceTo, setError);
    const paths = useLookup<Path>(measureMtu, setError);
    const cuts = useLookup<Cut>(findCut, setError);
    const evasions = useLookup<Evasion>(tryEvasion, setError);
    const [house, setHouse] = useState<Household | null>(null);
    const [leaves, setLeaves] = useState<Outbound | null>(null);
    const [newer, setNewer] = useState<Newer | null>(null);
    const [proxy, setProxy] = useState<ProxyState | null>(null);
    const [forPhone, setForPhone] = useState(false);
    const [copied, setCopied] = useState(false);
    const [tongue, setTongue] = useState(() => pickTongue(navigator.languages ?? ['en']));

    const say = WORDS[tongue];
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () =>
    {
        try
        {
            const [next, past, through, others, relay] = await Promise.all(
                [getStatus(), getHistory(), getTunnels(), getNeighbours(), getProxy()]);

            setStatus(next);
            setHistory(past.targets);
            setTunnels(through);
            setHouse(others);
            setProxy(relay);
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

    // A site carried in from the bookmark: watched and checked at once, so pressing
    // the button on a page that will not open lands on an answer rather than a form.
    useEffect(() =>
    {
        const asked = new URLSearchParams(window.location.search).get('check');

        if (asked === null || asked === '')
        {
            return;
        }

        window.history.replaceState({}, '', window.location.pathname);

        void (async () =>
        {
            try
            {
                await watchTarget(asked);
                await load();
                await latest.current?.();
            }
            catch (err)
            {
                setError((err as Error).message);
            }
        })();
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

            setStep(say.checkSixth);
            setSixth(await checkSixth());

            setStep(say.readingCertificates);

            const result = await runTls();

            setTls(result.checks ?? []);
            await load();

            // An answer that arrives without a verdict leaves the old headline
            // standing. A page gone blank is a worse diagnosis than a stale sentence,
            // and this one is read while the network is misbehaving.
            if (result.verdict != null)
            {
                setStatus((current) => current === null
                    ? current
                    : { ...current, verdict: result.verdict });
            }

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

    // Asked for, never habitual: a tool that promises no telemetry cannot phone home
    // on its own, however good the reason.
    const lookForUpdate = async (): Promise<void> =>
    {
        try
        {
            setNewer(await checkUpdate());
            setLeaves(null);
        }
        catch (err)
        {
            setError((err as Error).message);
        }
    };

    const switchProxy = async (preset?: string): Promise<void> =>
    {
        try
        {
            setProxy(await toggleProxy(preset, forPhone));
            setLeaves(null);
        }
        catch (err)
        {
            setError((err as Error).message);
        }
    };

    const showLeaves = async (): Promise<void> =>
    {
        try
        {
            setLeaves(leaves === null ? await getOutbound() : null);
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
                <div className="inner withface">
                    <img className="roflanich" src="/roflanich.png" alt="" />

                    <header className="masthead">
                        <b>
                            <img className="tiny" src="/roflanich.png" alt="" />
                            netcheck
                        </b>

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
            {/* An address that leads nowhere is the finding; having none is ordinary
                and says nothing worth a line. */}
            {sixth !== null && sixth.state !== 'absent' && (
                <p className={sixth.state === 'broken' ? 'reading small blamed' : 'reading small'}>
                    {say.sixth[sixth.state]}
                </p>
            )}

            {/* Everything else already on this network. A house with a dozen devices
                and an evening of stuttering usually has its answer here. */}
            {house !== null && house.neighbours.length > 0 && (
                <details className="reading house">
                    <summary className="small">{say.devices(house.neighbours.length)}</summary>

                    <ul className="others">
                        {house.neighbours.map((one) => (
                            <li key={one.address}>
                                <span>{one.address}</span>
                                <span className="host">{one.hardware}</span>
                                {one.gateway && <span className="host">{say.theRouter}</span>}
                            </li>
                        ))}
                    </ul>
                </details>
            )}

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
                            trace={answerFor(traces.found, target.targetId)}
                            onTrace={traces.ask}
                            path={answerFor(paths.found, target.targetId)}
                            onMeasure={paths.ask}
                            cut={answerFor(cuts.found, target.targetId)}
                            onCut={cuts.ask}
                            evasion={answerFor(evasions.found, target.targetId)}
                            onEvade={evasions.ask}
                            onUseWay={switchProxy}
                            forget={forget}
                        />
                    ))}
            </ul>

            {/* Built from the values the code uses, so it cannot drift from what the
                tool actually does. */}
            {/* Four grey links loose in the page read as leftovers. Folded together
                they read as a drawer somebody may open. */}
            <details className="tools">
                <summary className="small">{say.tools}</summary>

                <p className="small">
                    <button type="button" className="ghost" onClick={showLeaves}>
                        {say.whatLeaves}
                    </button>

                    <button type="button" className="ghost spaced" onClick={lookForUpdate}>
                        {say.lookForUpdate}
                    </button>

                    <button
                        type="button"
                        className="ghost spaced"
                        onClick={() => void switchProxy()}
                    >
                        {proxy?.running === true ? say.stopProxy : say.startProxy}
                    </button>
                </p>

                {/* Everybody on that network can route through it once it listens
                    there, so it is asked for rather than assumed. */}
                {proxy?.running !== true && (
                    <label className="repeat small">
                        <input
                            type="checkbox"
                            checked={forPhone}
                            onChange={(event) => setForPhone(event.target.checked)}
                        />
                        {say.forPhone}
                    </label>
                )}

                {proxy?.running === true && proxy.onNetwork && proxy.lan !== null && (
                    <div className="small">
                        <p>{say.phoneHow(proxy.lan, proxy.relays[0]?.port ?? 3128)}</p>
                        <p className="blamed">{say.phoneWarn}</p>
                    </div>
                )}

                {/* Zapret ships thirteen files called ALT and leaves a person to try
                    them in turn. These say what they do, cheapest first. */}
                {proxy?.running !== true && (proxy?.presets.length ?? 0) > 0 && (
                    <div className="presets small">
                        <p><b>{say.presets}</b></p>

                        <ul>
                            {proxy?.presets.map((preset) => (
                                <li key={preset.id}>
                                    <div>
                                        <b>{say.presetNames[preset.id] ?? preset.id}</b>
                                        <span>{say.presetSays[preset.id] ?? ''}</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => void switchProxy(preset.id)}
                                    >
                                        {say.usePreset}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {proxy?.running === true && (
                    <div className="small relays">
                        <p>
                            {proxy.preset === null
                                ? say.proxyRunning
                                : say.presetRunning(say.presetNames[proxy.preset]
                                    ?? proxy.preset)}
                        </p>

                        {/* The setting the system keeps is read by most of what
                            speaks HTTP here, and it belongs to this user, so nothing
                            asks for administrator rights. */}
                        <p>{proxy.system ? say.systemSet : say.systemFailed}</p>
                        <p>{say.systemLimit}</p>

                        <ul className="ports">
                            {proxy.relays.map((relay) => (
                                <li key={relay.port}>
                                    <code className="carry">127.0.0.1:{relay.port}</code>
                                    <span>{say.wayNames[relay.way] ?? relay.way}</span>
                                </li>
                            ))}
                        </ul>

                        <p>{say.proxyBlind}</p>

                        {proxy.overHttps && <p>{say.proxyOverHttps}</p>}

                    </div>
                )}

                {newer !== null && (
                <p className={newer.behind ? 'small blamed' : 'small'}>
                    {newer.error !== null && say.couldNotAsk}
                    {newer.error === null && newer.behind && say.newerExists(newer.latest ?? '')}
                    {newer.error === null && !newer.behind && say.upToDate(newer.current)}
                </p>
            )}

                {leaves !== null && (
                <div className="leaves small">
                    <ul>
                        {leaves.errands.map((errand) => (
                            <li key={errand.where}>
                                <b>{errand.where}</b> — {errand.why}
                                {errand.onDemand && <span className="host">
                                    {' '}({say.onDemand})</span>}
                            </li>
                        ))}
                    </ul>

                    <p><b>{say.neverDoes}</b></p>

                    <ul>
                        {leaves.never.map((one) => <li key={one}>{one}</li>)}
                    </ul>
                </div>
            )}

                {/* Carrying the address across is all it does: no extension, no
                    proxy, nothing watching what is open. */}
                <p className="small">
                {/* Handed over as text to copy rather than a link to drag: React
                    refuses to render a javascript: address, and it is right to —
                    that shape is how pages get talked into running somebody else's
                    code. */}
                    <code className="carry">
                        {bookmarklet(window.location.origin, window.location.pathname)}
                    </code>
                    {' '}{say.dragMe}
                </p>
            </details>

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


function Chain({ cause, say, has, opened, onOpen }:
{
    cause: Verdict['cause'];
    say: Words;
    has: Partial<Record<Link, boolean>>;
    opened: string | null;
    onOpen: (link: Link) => void;
})
{
    const stops = stopsAt(cause);

    return (
        <ol className="chain" aria-label="where the check reached">
            {CHAIN.map((link, index) =>
            {
                const shape = linkState(index, stops, cause);

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
function Lane({ target, past, say, trace, onTrace, path, onMeasure, cut, onCut,
    evasion, onEvade, onUseWay, forget }:
{
    target: StatusRow;
    say: Words;
    past: History | null;
    trace: Trace | 'running' | null;
    onTrace: (id: number, host: string) => void;
    path: Path | 'running' | null;
    onMeasure: (id: number, host: string) => void;
    cut: Cut | 'running' | null;
    onCut: (id: number, host: string) => void;
    evasion: Evasion | 'running' | null;
    onEvade: (id: number, host: string) => void;
    onUseWay: (way: string) => void;
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
                {runs.length > 0
                    && <span className="kept">{say.checksKept(runs.length)}</span>}
            </div>

            {/* Two actions crowded the numbers into two lines each; they stand on
                their own row instead. */}
            <div className="deeper">
                <button
                    type="button"
                    className="ghost"
                    onClick={() => onTrace(target.targetId, target.host)}
                    disabled={trace === 'running'}
                >
                    {trace === 'running' ? say.tracing : say.tracePath}
                </button>

                <button
                    type="button"
                    className="ghost"
                    onClick={() => onMeasure(target.targetId, target.host)}
                    disabled={path === 'running'}
                >
                    {path === 'running' ? say.measuring : say.measureMtu}
                </button>

                <button
                    type="button"
                    className="ghost"
                    onClick={() => onCut(target.targetId, target.host)}
                    disabled={cut === 'running'}
                >
                    {cut === 'running' ? say.checking : say.whoCuts}
                </button>

                <button
                    type="button"
                    className="ghost"
                    onClick={() => onEvade(target.targetId, target.host)}
                    disabled={evasion === 'running'}
                >
                    {evasion === 'running' ? say.trying : say.tryEvasion}
                </button>
            </div>

            {trace !== null && trace !== 'running' && <Path trace={trace} say={say} />}

            {path !== null && path !== 'running' && <Sizes path={path} say={say} />}

            {evasion !== null && evasion !== 'running' && (
                <Ways evasion={evasion} say={say} onUseWay={onUseWay} />
            )}

            {cut !== null && cut !== 'running' && (
                <p className={cut.culprit === 'open' ? 'path small' : 'path small blamed'}>
                    {say.culprit[cut.culprit]}
                </p>
            )}
        </li>
    );
}

/**
 * The number alone says nothing. What matters is how far below the ordinary size it
 * sits, and what a person notices when it does.
 */

/**
 * What each way of writing got back, and the one to use. Naming the working way and
 * leaving the person to find the switch themselves would be half an answer.
 */
function Ways({ evasion, say, onUseWay }:
{
    evasion: Evasion;
    say: Words;
    onUseWay: (way: string) => void;
})
{
    return (
        <div className="path small">
            <p className={evasion.splittingHelps ? 'blamed' : undefined}>
                {say.evasion[readEvasion(evasion)]}
            </p>

            {evasion.tried.length > 0 && (
                <ul className="ways">
                    {evasion.tried.map((one) => (
                        <li
                            key={one.way}
                            className={one.answer === 'greeted' ? 'through' : undefined}
                        >
                            <span>{say.wayNames[one.way] ?? one.way}</span>
                            <span>{say.answerNames[one.answer] ?? one.answer}</span>
                        </li>
                    ))}
                </ul>
            )}

            {evasion.works !== null && (
                <button type="button" className="ghost" onClick={() => onUseWay('')}>
                    {say.useThisWay(say.wayNames[evasion.works] ?? evasion.works)}
                </button>
            )}
        </div>
    );
}


function Sizes({ path, say }: { path: Path; say: Words })
{
    const read = readSize(path);

    if (read === 'unknown')
    {
        return <p className="path small">{path.error ?? say.emptyTrace}</p>;
    }

    const short = read === 'short';

    return (
        <p className={short ? 'path small blamed' : 'path small'}>
            {short
                ? say.mtuShort(path.mtu ?? 0, path.ordinary)
                : say.mtuFull(path.mtu ?? 0)}
        </p>
    );
}

/**
 * The hops between here and there. The layered checks say the far end is silent; this
 * says where along the way it went quiet, which is the one thing they cannot.
 */
function Path({ trace, say }: { trace: Trace; say: Words })
{
    const read = readTrace(trace);

    if (read !== 'hops')
    {
        return (
            <p className="path small">
                {read === 'error' ? trace.error : say.emptyTrace}
            </p>
        );
    }

    return (
        <ol className="path">
            {trace.hops.map((hop) => (
                <li key={hop.number} className={hopState(hop, trace.silentFrom)}>
                    <span className="where">{hop.address ?? '—'}</span>
                    <span className="took">{bestOf(hop.times)}</span>
                </li>
            ))}
        </ol>
    );
}






