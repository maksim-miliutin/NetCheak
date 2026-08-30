import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface Command
{
    file: string;
    args: string[];
}

export interface SystemProxy
{
    set: boolean;
    /** What the machine was set to before, so it can be put back. */
    was: string | null;
    error: string | null;
}

const KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

const TIMEOUT_MS = 10_000;

/**
 * A proxy the browser is told about serves the browser. The setting the system keeps
 * is read by Chrome, Edge and most of what else on the machine speaks HTTP, and it
 * belongs to this user rather than to the machine — so no administrator is asked.
 *
 * Every packet, whatever the program, is a different thing again: that means a driver
 * inside the kernel and the rights that come with it, which this tool does not ask
 * for and cannot honestly ship untested.
 */
export function commandsToSet(platform: string, pacUrl: string): Command[]
{
    if (platform === 'win32')
    {
        return [
            { file: 'reg', args: ['add', KEY, '/v', 'AutoConfigURL', '/t', 'REG_SZ',
                '/d', pacUrl, '/f'] },
        ];
    }

    if (platform === 'darwin')
    {
        return [
            { file: 'networksetup', args: ['-setautoproxyurl', 'Wi-Fi', pacUrl] },
            { file: 'networksetup', args: ['-setautoproxystate', 'Wi-Fi', 'on'] },
        ];
    }

    return [
        { file: 'gsettings', args: ['set', 'org.gnome.system.proxy', 'mode', 'auto'] },
        { file: 'gsettings', args: ['set', 'org.gnome.system.proxy', 'autoconfig-url', pacUrl] },
    ];
}

/** Putting it back matters more than setting it: a tool that leaves a machine
 *  pointed at a proxy that is no longer running has broken that machine. */
export function commandsToClear(platform: string, was: string | null): Command[]
{
    if (platform === 'win32')
    {
        return was === null || was === ''
            ? [{ file: 'reg', args: ['delete', KEY, '/v', 'AutoConfigURL', '/f'] }]
            : [{ file: 'reg', args: ['add', KEY, '/v', 'AutoConfigURL', '/t', 'REG_SZ',
                '/d', was, '/f'] }];
    }

    if (platform === 'darwin')
    {
        return [{ file: 'networksetup', args: ['-setautoproxystate', 'Wi-Fi', 'off'] }];
    }

    return [{ file: 'gsettings', args: ['set', 'org.gnome.system.proxy', 'mode', 'none'] }];
}

/** What the setting held before, so the same value can be put back afterwards. */
export async function readCurrent(platform: string): Promise<string | null>
{
    if (platform !== 'win32')
    {
        return null;
    }

    try
    {
        const { stdout } = await run('reg', ['query', KEY, '/v', 'AutoConfigURL'],
            { timeout: TIMEOUT_MS });

        return readRegistry(stdout);
    }
    catch (err)
    {
        // Not being there is the ordinary case, and it is not a failure.
        return null;
    }
}

export function readRegistry(output: string): string | null
{
    const found = /AutoConfigURL\s+REG_SZ\s+(\S+)/.exec(output);

    return found === null ? null : (found[1] ?? null);
}

export async function setSystemProxy(pacUrl: string, platform = process.platform):
    Promise<SystemProxy>
{
    const was = await readCurrent(platform);

    try
    {
        for (const command of commandsToSet(platform, pacUrl))
        {
            await run(command.file, command.args, { timeout: TIMEOUT_MS });
        }

        return { set: true, was, error: null };
    }
    catch (err)
    {
        return { set: false, was, error: (err as Error).message };
    }
}

export async function clearSystemProxy(was: string | null, platform = process.platform):
    Promise<SystemProxy>
{
    try
    {
        for (const command of commandsToClear(platform, was))
        {
            await run(command.file, command.args, { timeout: TIMEOUT_MS });
        }

        return { set: false, was: null, error: null };
    }
    catch (err)
    {
        return { set: false, was, error: (err as Error).message };
    }
}
