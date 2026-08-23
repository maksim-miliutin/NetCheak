import
{
    DEFAULTS,
    share,
    summarise,
    type Chunk,
    type Rate,
    type SpeedOptions,
    type SpeedResult,
    type Transfer,
} from './speed.ts';

export interface Source
{
    name: string;
    download: (bytes: number) => string;
    upload: string | null;
}

// Cloudflare runs these endpoints for its own speed page: they answer with junk of
// the size asked for, and swallow whatever is posted. Being on a CDN, the far end is
// close enough that the number reflects the line rather than the distance.
export const CLOUDFLARE: Source =
{
    name: 'Cloudflare',
    download: (bytes) => `https://speed.cloudflare.com/__down?bytes=${bytes}`,
    upload: 'https://speed.cloudflare.com/__up',
};

// One request per stream made the byte budget decide when the run ended: on a fast
// line it emptied in under two seconds, leaving less than a second of measurement once
// the warmup was dropped. Requests are asked for in portions and repeated until the
// clock runs out, so the window is the same length whatever the speed.
const PORTION_BYTES = 10_000_000;

const UPLOAD_BYTES = 8_000_000;

export async function measureSpeed(source: Source, options: SpeedOptions = {}): Promise<SpeedResult>
{
    const settings = { ...DEFAULTS, ...options };

    const download = await pull(source, settings);
    const upload = source.upload === null ? null : await push(source.upload, settings);

    return { source: source.name, download, upload };
}

async function pull(source: Source, settings: Required<SpeedOptions>): Promise<Rate | null>
{
    const portion = Math.max(1, Math.floor(PORTION_BYTES / settings.streams));

    const streams = Array.from({ length: settings.streams },
        () => readStream(source, portion, settings.durationMs));

    const transfers = (await Promise.all(streams)).filter((t): t is Transfer => t !== null);

    return summarise(transfers, settings.warmupMs);
}

async function push(url: string, settings: Required<SpeedOptions>): Promise<Rate | null>
{
    const budget = share(UPLOAD_BYTES, settings.streams);

    const transfers = await Promise.all(
        budget.map((bytes) => writeStream(url, bytes, settings.durationMs)));

    // No warmup is dropped here. Upload reports one lump at the end rather than a
    // stream of progress, so subtracting the ramp from the clock without subtracting
    // its bytes would inflate the figure. Counting the whole exchange reads a little
    // low, which is the safer direction to be wrong in.
    return summarise(transfers.filter((t): t is Transfer => t !== null), 0);
}

/** Keeps asking for portions until the clock runs out, noting when each slice landed. */
async function readStream(
    source: Source,
    portion: number,
    durationMs: number,
): Promise<Transfer | null>
{
    const control = new AbortController();
    const stop = setTimeout(() => control.abort(), durationMs);
    const started = performance.now();
    const chunks: Chunk[] = [];

    try
    {
        while (performance.now() - started < durationMs)
        {
            const response = await fetch(source.download(portion), { signal: control.signal });

            if (!response.ok || response.body === null)
            {
                break;
            }

            for await (const piece of response.body)
            {
                chunks.push({ at: performance.now() - started, bytes: piece.length });
            }
        }
    }
    catch (err)
    {
        // An abort is how the run is meant to end, so whatever arrived still counts.
        if (chunks.length === 0)
        {
            return null;
        }
    }
    finally
    {
        clearTimeout(stop);
    }

    return { chunks, elapsedMs: performance.now() - started };
}

/** Posts a body of the given size and times the whole exchange. */
async function writeStream(url: string, bytes: number, durationMs: number): Promise<Transfer | null>
{
    const control = new AbortController();
    const stop = setTimeout(() => control.abort(), durationMs);
    const started = performance.now();

    try
    {
        const response = await fetch(url,
        {
            method: 'POST',
            body: new Uint8Array(bytes),
            signal: control.signal,
        });

        if (!response.ok)
        {
            return null;
        }

        const elapsedMs = performance.now() - started;

        // Upload gives no progress to watch: the body leaves as one piece, so the
        // whole payload is recorded as landing at the end.
        return { chunks: [{ at: elapsedMs, bytes }], elapsedMs };
    }
    catch (err)
    {
        return null;
    }
    finally
    {
        clearTimeout(stop);
    }
}
