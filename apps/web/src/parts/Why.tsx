import type { ReactNode } from 'react';
import type { Words } from '../words';

/**
 * The long half of an explanation, folded away. The page said everything it knew all
 * the time, and four paragraphs above a log is a page people stop reading rather than
 * a page that explains itself.
 */
export function Why({ say, children }: { say: Words; children: ReactNode })
{
    return (
        <details className="why">
            <summary className="small">{say.why}</summary>
            {children}
        </details>
    );
}
