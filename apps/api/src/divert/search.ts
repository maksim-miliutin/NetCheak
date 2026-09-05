/**
 * Finding the settings that get a site through, instead of thirteen files named ALT
 * and somebody trying each one.
 *
 * The trying is here and the doing is passed in, so this runs where there is no
 * driver and no network.
 */

import type { Settings } from './runner.ts';
import { lureNames } from './lures.ts';

export interface Attempt
{
    settings: Settings;
    worked: boolean;
}

export interface Found
{
    /** The first that worked, or nothing when none did. */
    settings: Settings | null;
    tried: Attempt[];

    /** It answered before anything was tried on its behalf. */
    already: boolean;
}

export interface Trying
{
    candidates: Settings[];
    start(settings: Settings): Promise<void>;
    stop(): Promise<void>;
    answers(): Promise<boolean>;

    /** Waiting for the driver to settle before asking anything of it. */
    settle(): Promise<void>;
}

/**
 * Mildest first. A short life for the copy means nothing past the filter ever sees
 * it; a wrong checksum reaches the far end, and that is one more thing to go
 * differently on somebody else's card.
 */
export function candidates(hello: string | null, voice: string | null,
    only: string[] = []): Settings[]
{
    const ways: [Settings['fooling'], number, number][] =
    [
        ['ttl', 6, 6],
        ['ttl', 4, 6],
        ['ttl', 8, 6],
        ['ttl', 2, 6],
        ['badseq', 6, 6],
        ['badsum', 6, 6],
        ['ttl', 6, 12],
        ['badseq', 6, 12],
    ];

    const settings = ways.map(([fooling, ttl, repeats]) =>
        ({ fooling, ttl, repeats, hello, voice, only }));

    // A recorded hello carries the name of whoever was recorded, so there is nothing
    // to vary. Without one the name is written in, and which name it is decides
    // whether a filter objects: that is worth trying more than one of.
    if (hello !== null)
    {
        return settings;
    }

    // Names outside, ways inside: most failures are the way, not the name. Forty-
    // eight is a ceiling, not a cost — this stops at the first one that answers.
    return lureNames().flatMap((decoyName) =>
        settings.map((one) => ({ ...one, decoyName })));
}

/** Asked once before anything starts: a site that opens on its own needs nothing. */
export async function findSettings(trying: Trying): Promise<Found>
{
    if (await trying.answers())
    {
        return { settings: null, tried: [], already: true };
    }

    const tried: Attempt[] = [];

    for (const settings of trying.candidates)
    {
        await trying.start(settings);
        await trying.settle();

        const worked = await trying.answers();

        tried.push({ settings, worked });

        if (worked)
        {
            return { settings, tried, already: false };
        }
    }

    await trying.stop();

    return { settings: null, tried, already: false };
}
