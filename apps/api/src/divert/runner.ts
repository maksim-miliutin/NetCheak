/**
 * The driver loop sits inside a call that does not return until a packet arrives. Run
 * in the server it would stop the server, so it runs beside it and this holds it.
 *
 * It launches the same script a person can run by hand, with the same arguments.
 */

export interface Settings
{
    fooling: 'badsum' | 'badseq' | 'ttl' | 'none';
    ttl: number;
    repeats: number;
    /** A recorded hello sent ahead of the real one, or nothing to rewrite the name. */
    hello: string | null;
    /** A recorded datagram sent ahead of a call, or nothing to leave voice alone. */
    voice: string | null;
    // Empty means everything, which is how a machine doing nothing in particular
    // came to send six copies a second to sites nobody blocks.
    only: string[];
}

export interface DivertState
{
    running: boolean;
    settings: Settings | null;
    /** The last lines the loop printed, newest last. */
    lines: string[];
    /** Why it stopped, when it stopped by itself. */
    error: string | null;

    /** Whether this program could open the driver if it were asked to. */
    elevated?: boolean;
}

/** As much of a child process as this needs, so a test can hand it another. */
export interface Running
{
    stdout: { on(event: 'data', listen: (chunk: unknown) => void): unknown };
    /** What went wrong is printed here, and swallowing it leaves nothing to read. */
    stderr: { on(event: 'data', listen: (chunk: unknown) => void): unknown };
    on(event: 'exit', listen: (code: number | null) => void): unknown;
    kill(): unknown;
}

export type Launch = (args: string[]) => Running;

export const DEFAULTS: Settings =
{
    fooling: 'ttl',
    ttl: 6,
    repeats: 6,
    hello: null,
    voice: null,
    only: [],
};

// Enough to see what is happening and not enough to hold a day of it in memory.
const KEPT = 200;

export class Divert
{
    private readonly launch: Launch;

    private started: Running | null = null;

    private settings: Settings | null = null;

    private lines: string[] = [];

    private error: string | null = null;

    // Written out rather than declared in the argument list: Node runs this source
    // as it is, stripping the types and nothing more, and a parameter property is not
    // a type to strip — it is code to generate. The compiler allows it and the runtime
    // does not, which is the worst place for a difference to live.
    constructor(launch: Launch)
    {
        this.launch = launch;
    }

    state(): DivertState
    {
        return {
            running: this.started !== null,
            settings: this.settings,
            lines: [...this.lines],
            error: this.error,
        };
    }

    // Two loops would open the driver twice and cut every packet twice over.
    start(settings: Settings): DivertState
    {
        this.stop();

        this.settings = settings;
        this.lines = [];
        this.error = null;

        const started = this.launch(asArguments(settings));

        started.stdout.on('data', (chunk) => this.heard(String(chunk)));
        started.stderr.on('data', (chunk) => this.heard(String(chunk)));

        started.on('exit', (code) =>
        {
            this.started = null;
            this.error = code === 0 || code === null
                ? null
                : `The driver loop stopped with ${code}. Administrator rights are what `
                    + 'it usually wants.';
        });

        this.started = started;

        return this.state();
    }

    stop(): DivertState
    {
        this.started?.kill();
        this.started = null;

        return this.state();
    }

    private heard(text: string): void
    {
        const said = text.split('\n').map((line) => line.trimEnd()).filter(Boolean);

        this.lines = [...this.lines, ...said].slice(-KEPT);
    }
}

/** The same words a person would type by hand. */
export function asArguments(settings: Settings): string[]
{
    const said =
    [
        `fooling=${settings.fooling}`,
        `ttl=${settings.ttl}`,
        `repeats=${settings.repeats}`,
    ];

    if (settings.hello !== null)
    {
        said.push(`hello=${settings.hello}`);
    }

    if (settings.voice !== null)
    {
        said.push(`voice=${settings.voice}`);
    }

    if (settings.only.length > 0)
    {
        said.push(`only=${settings.only.join(',')}`);
    }

    return said;
}
