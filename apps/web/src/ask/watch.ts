export interface WatchState
{
    /** Milliseconds since the last check finished, or null when none has run. */
    sinceMs: number | null;
    busy: boolean;
    hidden: boolean;
    enabled: boolean;
}

export const EVERY_MS = 300_000;

/**
 * The history is only worth drawing if something fills it, so a check runs on its own
 * while the page is open. Deciding when is kept apart from the timer that asks: a rule
 * about time is testable, a timer is not.
 */
export function isDue(state: WatchState, everyMs = EVERY_MS): boolean
{
    if (!state.enabled || state.busy)
    {
        return false;
    }

    // A hidden tab measures the machine sleeping rather than the line, and browsers
    // throttle its timers anyway. Nothing is asked until it comes back.
    if (state.hidden)
    {
        return false;
    }

    return state.sinceMs === null || state.sinceMs >= everyMs;
}

/** Seconds until the next run, for the line that says when it will happen. */
export function nextInSeconds(sinceMs: number | null, everyMs = EVERY_MS): number
{
    if (sinceMs === null)
    {
        return 0;
    }

    return Math.max(0, Math.ceil((everyMs - sinceMs) / 1000));
}
