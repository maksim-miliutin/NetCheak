export interface Chunk
{
    /** Milliseconds since the transfer started, when this slice of bytes landed. */
    at: number;
    bytes: number;
}

export interface Transfer
{
    chunks: Chunk[];
    elapsedMs: number;
}

export interface Rate
{
    megabits: number;
    bytes: number;
    seconds: number;
    streams: number;
}

export interface SpeedResult
{
    source: string;
    download: Rate | null;
    upload: Rate | null;
}

export interface SpeedOptions
{
    streams?: number;
    durationMs?: number;
    warmupMs?: number;
}

export const DEFAULTS: Required<SpeedOptions> =
{
    // A single connection rarely fills a fast line: the window grows too slowly and
    // one lost packet halves it. Four is enough to saturate a home link without
    // turning the measurement into a flood.
    streams: 4,
    durationMs: 5000,

    // TCP starts slow on purpose. Counting the ramp would report a number nobody
    // ever sees again.
    warmupMs: 1200,
};

/** Bytes that arrived after the warmup, turned into megabits per second. */
export function summarise(transfers: Transfer[], warmupMs: number): Rate | null
{
    if (transfers.length === 0)
    {
        return null;
    }

    let bytes = 0;
    let longest = 0;

    for (const transfer of transfers)
    {
        for (const chunk of transfer.chunks)
        {
            if (chunk.at >= warmupMs)
            {
                bytes += chunk.bytes;
            }
        }

        longest = Math.max(longest, transfer.elapsedMs - warmupMs);
    }

    if (longest <= 0 || bytes === 0)
    {
        return null;
    }

    const seconds = longest / 1000;

    return {
        megabits: round((bytes * 8) / seconds / 1_000_000),
        bytes,
        seconds: round(seconds),
        streams: transfers.length,
    };
}

/** Splits a byte budget across streams, so the last one carries the remainder. */
export function share(total: number, streams: number): number[]
{
    if (streams < 1)
    {
        return [];
    }

    const each = Math.floor(total / streams);
    const parts = Array.from({ length: streams }, () => each);
    const last = parts.length - 1;

    parts[last] = (parts[last] ?? 0) + (total - each * streams);

    return parts;
}

function round(value: number): number
{
    return Math.round(value * 100) / 100;
}
