import { accessSync, constants, existsSync, mkdirSync, writeFileSync, unlinkSync }
    from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Placed
{
    file: string;
    /** The place asked for first, when it turned out not to be writable. */
    refused: string | null;
}

const FOLDER = '.netcheck';

/**
 * One database, wherever the program was started from. Two entry points each picked
 * their own — beside the binary and inside the working folder — and a site added in
 * one was gone in the other, which reads as nothing being saved at all.
 *
 * A database already sitting in the old place keeps being used: somebody's history
 * is worth more than tidiness, and moving it silently is worse than leaving it.
 */
export function whereDatabase(beside: string): string
{
    const asked = process.env.NETCHECK_DB;

    if (asked !== undefined && asked !== '')
    {
        return asked;
    }

    for (const older of [beside, join(process.cwd(), 'netcheck.db')])
    {
        if (existsSync(older))
        {
            return older;
        }
    }

    return join(homedir(), FOLDER, 'netcheck.db');
}

/**
 * Somebody who runs the binary out of a folder they cannot write to — a read-only
 * share, a mounted image, Program Files — was shown a database error and nothing
 * else. The home folder is tried next, since that is somewhere they always own.
 */
export function placeDatabase(wanted: string): Placed
{
    if (isWritable(dirname(wanted)))
    {
        return { file: wanted, refused: null };
    }

    // Home first, since that is somewhere a person owns and can find again. A locked
    // down account may not have one to write to either, and falling over at the second
    // step would be the same failure one floor down.
    for (const root of [homedir(), tmpdir()])
    {
        const folder = join(root, FOLDER);

        if (make(folder))
        {
            return { file: join(folder, 'netcheck.db'), refused: wanted };
        }
    }

    throw new Error(`Nowhere to keep the history: ${wanted}, the home folder and the`
        + ' temporary folder are all closed for writing');
}

function make(folder: string): boolean
{
    try
    {
        mkdirSync(folder, { recursive: true });

        return isWritable(folder);
    }
    catch (err)
    {
        return false;
    }
}

/** Asked by writing, since the permission bits lie on plenty of arrangements. */
export function isWritable(folder: string): boolean
{
    try
    {
        accessSync(folder, constants.W_OK);

        const probe = join(folder, `.netcheck-${process.pid}`);

        writeFileSync(probe, '');
        unlinkSync(probe);

        return true;
    }
    catch (err)
    {
        return false;
    }
}
