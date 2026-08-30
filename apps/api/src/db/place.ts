import { accessSync, constants, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
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
