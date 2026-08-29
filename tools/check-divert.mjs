/**
 * Does the driver open at all. This is the first thing to know and the hardest to
 * guess at: everything past it depends on the answer, and the answer differs by
 * machine, by rights and by which files are where.
 */

import { existsSync } from 'node:fs';
import { platform } from 'node:process';

const NEEDED = ['WinDivert.dll', 'WinDivert64.sys'];

function say(mark, text)
{
    console.log(`${mark}  ${text}`);
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
    koffi = await import('koffi');
    say('ok', 'koffi is installed');
}
catch (err)
{
    say('no', 'koffi is missing. Run: npm install koffi');
    process.exit(1);
}

try
{
    const library = koffi.load('WinDivert.dll');

    say('ok', 'WinDivert.dll loaded');

    const open = library.func('WinDivertOpen', 'void *', ['str', 'int', 'int16', 'uint64']);
    const close = library.func('WinDivertClose', 'bool', ['void *']);

    // Narrow on purpose: this asks whether the driver starts, not to catch traffic.
    const handle = open('outbound and tcp.DstPort == 65530', 0, 0, 0);

    if (handle === null || Number(handle) === -1)
    {
        say('no', 'The driver did not start. Almost always this is rights: close this,');
        say('  ', 'open PowerShell as administrator, and run it again.');
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
