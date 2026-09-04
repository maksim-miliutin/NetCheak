import type { Words } from '../words';
import type
{
    Verdict,
} from '../types';

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
