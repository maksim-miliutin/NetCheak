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

/**
 * A log that folds away and can be taken out of here.
 *
 * It sat open and pushed everything under it off the screen, and the one thing
 * somebody wants to do with a log — send it to whoever is helping — could only be
 * done by selecting a scrolling box with a mouse.
 */
export function Log({ lines, say, name }:
{
    lines: string[];
    say: Words;
    /** What the saved file is called, so two logs do not overwrite each other. */
    name: string;
})
{
    const save = (): void =>
    {
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const at = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = at;
        link.download = `${name}-${new Date().toISOString().slice(0, 10)}.txt`;
        link.click();

        URL.revokeObjectURL(at);
    };

    return (
        <details className="log">
            <summary className="small">{say.showLog(lines.length)}</summary>

            <ul className="lines" aria-live="off">
                {lines.map((line, at) => (
                    <li key={`${at}-${line}`}><code>{line}</code></li>
                ))}
            </ul>

            <button type="button" className="ghost" onClick={save}>
                {say.saveLog}
            </button>
        </details>
    );
}
