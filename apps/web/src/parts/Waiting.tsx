import type { Words } from '../words';

/**
 * The face is the page's own, and it is the only thing on it that ever moves: it
 * leans when the news is bad. Turning it while the first answers are fetched says
 * the same thing the page says everywhere else, rather than borrowing a spinner
 * from somebody else's application.
 */
export function Waiting({ say }: { say: Words })
{
    return (
        <div className="waiting">
            <img className="turning" src="/roflanich.png" alt="" />
            <p>{say.loading}</p>
        </div>
    );
}
