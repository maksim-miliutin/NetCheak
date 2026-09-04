/**
 * Does the driver open at all. This is the first thing to know and the hardest to
 * guess at: everything past it depends on the answer, and the answer differs by
 * machine, by rights and by which files are where.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:process';

const NEEDED = ['WinDivert.dll', 'WinDivert64.sys'];

// WinDivertOpen answers with -1 rather than with nothing when it refuses, and koffi
// hands a pointer back as an opaque object: converting one to a number throws instead
// of comparing. Only its address can be looked at, and only as a whole number.
const NOT_A_HANDLE = 0xffffffffffffffffn;

// What Windows means by the number it leaves behind. Saying "almost always rights"
// was a guess, and a guess is what this script is here to replace.
const REASONS = new Map(
[
    [5, 'Access denied. Open PowerShell as administrator and run this again.'],
    [2, 'WinDivert64.sys was not found beside WinDivert.dll.'],
    [87, 'The driver refused the arguments. Usually the .dll and the .sys come from '
        + 'different WinDivert releases: take both from one archive, x64 folder.'],
    [577, 'Windows refused the driver signature.'],
    [1058, 'The WinDivert service is installed but disabled.'],
    [1060, 'The WinDivert service is not installed.'],
    [1073, 'A WinDivert service of another version is already installed. Zapret and '
        + 'GoodbyeDPI each ship their own: sc.exe stop WinDivert, then delete it.'],
    [1275, 'The driver is blocked by policy.'],
    [1753, 'The driver service is there but nothing is listening for it.'],
]);

function say(mark, text)
{
    console.log(`${mark}  ${text}`);
}

/** net.exe answers this only to an elevated session, and refuses every other one. */
function elevated()
{
    try
    {
        execFileSync('net', ['session'], { stdio: 'ignore' });

        return true;
    }
    catch
    {
        return false;
    }
}

if (platform !== 'win32')
{
    say('—', `This is a Windows path and this machine runs ${platform}.`);
    process.exit(1);
}

let ready = true;

for (const file of NEEDED)
{
    if (existsSync(file))
    {
        say('ok', `${file} is here`);
        continue;
    }

    ready = false;
    say('no', `${file} is missing. Take it from the x64 folder of the WinDivert release`);
}

if (!ready)
{
    process.exit(1);
}

let koffi;

try
{
    // koffi is CommonJS, so an import hands back a namespace with the library under
    // default. Whether the functions also appear at the top of it is up to how well
    // Node reads the module, and that has changed between versions.
    const module = await import('koffi');

    koffi = module.default ?? module;

    say('ok', 'koffi is installed');
}
catch
{
    say('no', 'koffi is missing. Run: npm install koffi');
    process.exit(1);
}

const asAdministrator = elevated();

say(asAdministrator ? 'ok' : 'no', asAdministrator
    ? 'running as administrator'
    : 'not running as administrator, which is what the driver needs');

try
{
    const library = koffi.load('WinDivert.dll');

    say('ok', 'WinDivert.dll loaded');

    const open = library.func('WinDivertOpen', 'void *', ['str', 'int', 'int16', 'uint64']);
    const close = library.func('WinDivertClose', 'bool', ['void *']);

    // Declared before the driver is touched: loading a library and reading a
    // signature both call into Windows, and either would replace the very number
    // this is here to read afterwards.
    const kernel = koffi.load('kernel32.dll');
    const lastError = kernel.func('GetLastError', 'uint32', []);

    // Narrow on purpose: this asks whether the driver starts, not to catch traffic.
    const handle = open('outbound and tcp.DstPort == 65530', 0, 0, 0);

    if (handle === null || BigInt(koffi.address(handle)) === NOT_A_HANDLE)
    {
        const code = lastError();

        say('no', `The driver did not start. Windows answered ${code}.`);
        say('  ', REASONS.get(code) ?? 'That code is not one this script knows about.');
        process.exit(1);
    }

    close(handle);

    say('ok', 'The driver started and stopped cleanly.');
    say('  ', 'Everything needed is in place.');
}
catch (err)
{
    say('no', err.message);
    say('  ', 'If this mentions access or denial, run as administrator.');
    process.exit(1);
}
