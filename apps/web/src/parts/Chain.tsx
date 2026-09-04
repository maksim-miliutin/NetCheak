import { CHAIN, linkState, stopsAt, type Link } from '../read/page';
import type { Words } from '../words';
import type
{
    Verdict,
} from '../types';

export function Chain({ cause, say, has, opened, onOpen, walking }:
{
    cause: Verdict['cause'];
    say: Words;
    has: Partial<Record<Link, boolean>>;
    opened: string | null;
    onOpen: (link: Link) => void;
    /** A check is running, and it walks this chain in this order. */
    walking?: boolean;
})
{
    const stops = stopsAt(cause);

    return (
        <ol
            className={walking === true ? 'chain walking' : 'chain'}
            aria-label="where the check reached"
        >
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
