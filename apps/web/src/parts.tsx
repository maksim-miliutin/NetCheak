import { ceilingOf, plot } from './trace';
import
{
    bestOf,
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
import type { Words } from './words';
import type
{
    Cut,
    DnsCheck,
    Evasion,
    History,
    Path,
    SpeedRow,
    StatusRow,
    TlsCheck,
    Trace,
    Verdict,
} from './types';


// The tool follows a chain: this machine, the router, the line past it, the names,
// then the connections themselves. Every verdict is a statement about where that
// chain stops, so the chain is drawn and the break marked on it.


export function Chain({ cause, say, has, opened, onOpen }:
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
export function Headline({ verdict, say }: { verdict: Verdict; say: Words })
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
export function Lane({ target, past, say, trace, onTrace, path, onMeasure, cut, onCut,
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
