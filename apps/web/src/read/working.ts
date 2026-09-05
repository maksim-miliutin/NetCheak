import type { Evasion, Preset, Way } from '../types';

/**
 * Which ways of writing a hello have got past something, across every site checked
 * so far.
 *
 * The check already tries all eight against one site and says which worked. That
 * answer sat beside the site it came from, where nobody looking at the list of
 * presets could see it — and the list of presets is exactly where somebody is
 * deciding which way to use.
 */
export interface Working
{
    /** Ways that got a site through, and how many sites each one got through. */
    ways: Map<Way, number>;
    /** How many sites have been checked at all, so nothing is read into silence. */
    checked: number;
}

/**
 * Reads the answers as they stand. A check still running counts for nothing: it has
 * not said anything yet, and treating it as a failure would mark a way as useless
 * for as long as it takes to find out otherwise.
 */
export function whatWorks(answers: (Evasion | 'running' | null)[]): Working
{
    const ways = new Map<Way, number>();
    let checked = 0;

    for (const one of answers)
    {
        if (one === null || one === 'running' || one.error !== null)
        {
            continue;
        }

        checked += 1;

        for (const tried of one.tried)
        {
            // Greeted is the one that means through: the server answered as a
            // server. Complained and reset both reached something that talked back
            // and neither is the site.
            if (tried.answer !== 'greeted')
            {
                continue;
            }

            ways.set(tried.way, (ways.get(tried.way) ?? 0) + 1);
        }
    }

    return { ways, checked };
}

/**
 * Whether a preset's way is one that has worked somewhere.
 *
 * A site that opens on its own answers for every way, so this says nothing until
 * something has actually been blocked. That is the honest shape of it: the mark
 * means "this got past something", not "this is the one to use".
 */
export function marks(working: Working, way: Way): number
{
    return working.ways.get(way) ?? 0;
}

/**
 * The lightest preset that writes a hello this way, or nothing when none does.
 *
 * The check finds a way and the proxy is chosen by preset, so somebody has to make
 * the step between them. The button that says "use this way" used to pass an empty
 * string, which means every way at once: it promised the one thing found and turned
 * on all ten.
 *
 * Lightest because the presets are already ordered by what they cost, and the first
 * one that writes this way is the cheapest way of getting it.
 */
export function presetFor(way: Way, presets: Preset[]): string | undefined
{
    return presets.find((one) => one.way === way)?.id;
}
