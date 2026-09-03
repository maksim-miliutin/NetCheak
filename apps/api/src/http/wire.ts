import type { StatusRow, SpeedRow } from '../db/checks.repository.ts';
import type { Verdict } from '../verdict/verdict.ts';
import type { Rings } from '../route/rings.ts';

/**
 * The two answers assembled here rather than by a check of their own, so there was
 * nowhere else to name them. Everything else this API returns is already the return
 * type of the function that measured it, and the page imports those.
 */
export interface Status
{
    verdict: Verdict;
    targets: StatusRow[];
    speed: SpeedRow | null;
    rings: Rings | null;
}

export interface Health
{
    status: 'ok' | 'degraded';

    /** What is running, so a page can say which version somebody is looking at. */
    version: string;
    database:
    {
        reachable: boolean;
        latencyMs?: number;
        error?: string;
    };
}
