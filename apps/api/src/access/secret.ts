import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * The word a phone on the network has to know. Loopback needs none of it; a
 * flatmate is on the same subnet and is still not this person.
 *
 * It sits beside the database and never in it: the database is the one thing that
 * might be shown to somebody.
 */
export interface Secret
{
    word: string;
    file: string;
}

const NAME = 'network-key';

/** Generated rather than chosen: a word nobody picked is one nobody reused. */
export function networkKey(beside: string): Secret
{
    const file = join(dirname(beside), NAME);

    if (existsSync(file))
    {
        return { word: readFileSync(file, 'utf8').trim(), file };
    }

    // Short enough to type off a screen, long enough that guessing it is not worth
    // anybody's afternoon.
    const word = randomBytes(9).toString('base64url');

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, word + '\n', { mode: 0o600 });

    return { word, file };
}

/** The header browsers already send to a proxy that asks for a password. */
export function carriesKey(header: string | undefined, word: string): boolean
{
    if (header === undefined)
    {
        return false;
    }

    const [kind, value] = header.split(' ');

    if (kind !== 'Basic' || value === undefined)
    {
        return false;
    }

    // A browser sends user:password, and only the password half is the word here.
    const decoded = Buffer.from(value, 'base64').toString('utf8');

    return decoded.slice(decoded.indexOf(':') + 1) === word;
}
