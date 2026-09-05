import { ceilingOf, plot } from '../read/trace';
import { bestOf, format, hopState, readEvasion, readSize, readTrace } from '../read/page';
import type { Words } from '../words';
import type
{
    Cut,
    Evasion,
    History,
    Path,
    StatusRow,
    Trace,
} from '../types';

const LANE_WIDTH = 640;

const LANE_HEIGHT = 40;

/**
 * A lane per target, its history drawn as a trace across the sheet. The tool has been
 * sampling over time since the first version; showing a moment instead of the run of
 * it threw most of what it knows away.
 */

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

    const closing = cut === 'running' || evasion === 'running';
    const slowing = trace === 'running' || path === 'running';

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
                {/* Two questions, not four checks. Nobody wants a packet size
                    measured; they want to know why large files stall. */}
                <button
                    type="button"
                    className="ghost"
                    disabled={closing}
                    onClick={() =>
                    {
                        onCut(target.targetId, target.host);
                        onEvade(target.targetId, target.host);
                    }}
                >
                    {closing ? say.asking : say.whyClosed}
                </button>

                <button
                    type="button"
                    className="ghost"
                    disabled={slowing}
                    onClick={() =>
                    {
                        onTrace(target.targetId, target.host);
                        onMeasure(target.targetId, target.host);
                    }}
                >
                    {slowing ? say.asking : say.whySlow}
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

            {/* The way that was found, not an empty string: empty means every way at
                once, and this button names one. */}
            {evasion.works !== null && (
                <button
                    type="button"
                    className="ghost"
                    onClick={() => onUseWay(evasion.works as string)}
                >
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

/**
 * The long half of an explanation, folded away. The page said everything it knew all
 * the time, and four paragraphs above a log is a page people stop reading rather than
 * a page that explains itself.
 */
