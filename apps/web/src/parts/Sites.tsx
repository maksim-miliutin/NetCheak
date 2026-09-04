import type { Words } from '../words';
import type
{
    Way,
    RoutedHost,
} from '../types';

interface SitesProps
{
    routed: RoutedHost[];
    ways: Way[];
    say: Words;
    typed: string;
    onType: (typed: string) => void;
    // One of the eight ways of writing a hello, not any string: a way this does
    // not have is a routing file that sends a site to a port nobody opened.
    chosen: Way;
    onChoose: (way: Way) => void;
    onAdd: () => void;
    onDrop: (host: string) => void;
}

/**
 * The routing file sends each of these to the port whose way of writing got it
 * through, and everything else straight out. The list is the reason for that file:
 * without it the tool would either route everything or route nothing.
 */

/**
 * The routing file sends each of these to the port whose way of writing got it
 * through, and everything else straight out. The list is the reason for that file:
 * without it the tool would either route everything or route nothing.
 */
export function Sites({ routed, ways, say, typed, onType, chosen, onChoose, onAdd,
    onDrop }: SitesProps)
{
    return (
        <section className="sites">
            <h2>{say.ownSites}</h2>
            <p className="says small">{say.ownSitesSays}</p>

            {routed.length === 0 && <p className="small blamed">{say.noOwnSites}</p>}

            {routed.length > 0 && (
                <ul>
                    {routed.map((row) => (
                        <li key={row.host}>
                            <code className="carry">{row.host}</code>
                            <span>{say.wayNames[row.way] ?? row.way}</span>
                            {!row.byHand && <span className="found">{say.foundItself}</span>}

                            <button
                                type="button"
                                className="forget"
                                aria-label={say.dropSite(row.host)}
                                onClick={() => onDrop(row.host)}
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="pick">
                <label htmlFor="site-address">{say.siteAddress}</label>

                <input
                    id="site-address"
                    value={typed}
                    onChange={(event) => onType(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && onAdd()}
                />

                <select value={chosen} onChange={(event) => onChoose(event.target.value as Way)}>
                    {ways.map((way) => (
                        <option key={way} value={way}>{say.wayNames[way] ?? way}</option>
                    ))}
                </select>

                <button type="button" disabled={typed.trim() === ''} onClick={onAdd}>
                    {say.addSite}
                </button>
            </div>
        </section>
    );
}


/**
 * The face is the page's own, and it is the only thing on it that ever moves: it
 * leans when the news is bad. Turning it while the first answers are fetched says
 * the same thing the page says everywhere else, rather than borrowing a spinner
 * from somebody else's application.
 */
