import { Log } from './Why';
import type { Words } from '../words';
import type
{
    DivertState,
    DriverFound,
    Searched,
} from '../types';

interface DriverProps
{
    divert: DivertState | null;
    say: Words;
    busy: boolean;
    typed: string;
    onType: (typed: string) => void;
    helped: DriverFound[];
    onAlso: () => void;
    onForget: (host: string) => void;
    searching: boolean;
    found: Searched | null;
    onFind: () => void;
}

/**
 * The driver reaches below every program on the machine, which is the whole of its
 * use and the whole of its danger: what it does wrong, it does to everything. So it
 * says what it is doing, line by line, rather than working quietly.
 */

/**
 * The driver reaches below every program on the machine, which is the whole of its
 * use and the whole of its danger: what it does wrong, it does to everything. So it
 * says what it is doing, line by line, rather than working quietly.
 */
export function Driver({ divert, say, busy, typed, onType, searching, found,
    onFind, helped, onAlso, onForget }: DriverProps)
{
    const running = divert?.running === true;

    return (
        <section className={busy ? 'driver working' : 'driver'} aria-busy={busy}>
            <span className="sweep" />

            <div className="top">
                <h2 translate="no">{say.divertTitle}</h2>

                <span className="state" role="status">
                    {running ? say.divertRunning : say.divertStopped}
                </span>
            </div>

            <p className="says small">{say.divertSays}</p>

            {/* No button of its own: it goes on with the proxy, and the one thing it
                cannot do without is rights this program may not have. */}
            {divert?.elevated === false && (
                <>
                    <p className="small blamed">{say.divertNoRights}</p>
                    <p className="says small">{say.divertHowTo}</p>
                </>
            )}

            {divert?.elevated !== false && !running && (
                <p className="says small">{say.divertWith}</p>
            )}

            {divert?.error !== null && divert?.error !== undefined && (
                <p className="small blamed">{say.divertNeedsRights}</p>
            )}

            {/* The whole point, and the thing that took an afternoon by hand: try the
                settings in turn against one site and keep the first that answers. */}
            {/* One field, two things to do with it. Two fields both asking for a
                site address, a hand's width apart, is a question about which one. */}
            <div className="pick">
                <label htmlFor="find-for">{say.findFor}</label>

                <input
                    id="find-for"
                    value={typed}
                    disabled={searching}
                    onChange={(event) => onType(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && onFind()}
                />

                <button
                    type="button"
                    disabled={searching || typed.trim() === ''}
                    onClick={onFind}
                >
                    {searching ? say.finding : say.find}
                </button>

                {/* Only once something has been found: with nothing to copy this
                    button has nothing to do, and a button that does nothing is worse
                    than one that is not there. */}
                {helped.length > 0 && (
                    <button
                        type="button"
                        className="ghost"
                        disabled={searching || typed.trim() === ''}
                        onClick={onAlso}
                    >
                        {say.helpAlso}
                    </button>
                )}
            </div>

            {found !== null && (
                <p className="says small" role="status">
                    {found.already && say.foundAlready}

                    {!found.already && found.settings === null && say.foundNothing}

                    {!found.already && found.settings !== null
                        && say.foundIt(found.settings.fooling, found.settings.ttl)}

                    {found.tried.length > 0 && ` (${say.triedSoFar(found.tried.length)})`}
                </p>
            )}

            {/* Who gets the copies. Empty, and everything the machine talks to gets
                them — which is more than any of it asked for. */}
            <h3>{say.helpedSites}</h3>
            <p className="says small">{say.helpedSays}</p>

            <ul className="sites-list">
                {helped.length === 0 && <li className="quiet">{say.noneHelped}</li>}

                {helped.map((one) => (
                    <li key={one.host}>
                        <code>{one.host}</code>
                        <span>{one.fooling}{one.fooling === 'ttl' ? ` ${one.ttl}` : ''}</span>

                        <button
                            type="button"
                            className="ghost forget"
                            onClick={() => onForget(one.host)}
                        >
                            ×
                        </button>
                    </li>
                ))}
            </ul>

            {running && divert.lines.length > 0 && (
                <Log lines={divert.lines} say={say} name="driver" />
            )}

            {running && divert.lines.length === 0 && (
                <p className="says small">{say.divertQuiet}</p>
            )}
        </section>
    );
}
