import type { Rings } from '../route/rings.ts';
import type { DnsCheck } from '../dns/resolve.ts';
import type { TlsCheck } from '../tls/handshake.ts';
import type { SixthCheck } from '../route/sixth.ts';
import type { Path } from '../mtu/mtu.ts';

export interface Findings
{
    rings: Rings | null;
    dns: DnsCheck | null;
    tls: TlsCheck[];
    sixth: SixthCheck | null;
    paths: Path[];
    neighbours: number | null;
}

export interface Kept<T>
{
    what: T;
    /** Milliseconds since this was found, so a reader can weigh it. */
    ageMs: number;
}

/**
 * What the checks last found, each with the moment it was found. Six separate
 * variables held this before, none of them remembering when: a report could describe
 * this minute's connections beside yesterday's certificates and say nothing about it.
 */
export class LastSeen
{
    private readonly at = new Map<keyof Findings, number>();

    private readonly found: Findings =
    {
        rings: null,
        dns: null,
        tls: [],
        sixth: null,
        paths: [],
        neighbours: null,
    };

    private readonly clock: () => number;

    constructor(clock: () => number = () => Date.now())
    {
        this.clock = clock;
    }

    put<K extends keyof Findings>(key: K, what: Findings[K]): void
    {
        this.found[key] = what;
        this.at.set(key, this.clock());
    }

    get<K extends keyof Findings>(key: K): Findings[K]
    {
        return this.found[key];
    }

    /** How long ago, or null for something that was never looked at. */
    ageOf(key: keyof Findings): number | null
    {
        const when = this.at.get(key);

        return when === undefined ? null : this.clock() - when;
    }

    /**
     * The oldest thing still being reported. A report that mixes minutes should say
     * so, and it cannot say so without this.
     */
    oldestMs(): number | null
    {
        const ages = [...this.at.keys()]
            .map((key) => this.ageOf(key))
            .filter((age): age is number => age !== null);

        return ages.length === 0 ? null : Math.max(...ages);
    }

    all(): Findings
    {
        return { ...this.found };
    }
}
