/**
 * The loop. It asks the driver for packets, cuts the ones carrying a handshake into
 * two, and hands both back. Everything else is passed along untouched.
 *
 * Run it from a PowerShell opened as administrator, then open a site in a browser and
 * watch what it says. Stop it with Ctrl+C: the driver is closed on the way out, and a
 * driver left open holds traffic that nothing is reading.
 */

import { platform } from 'node:process';
import { splitPacket } from '../apps/api/src/divert/packet.ts';
import { findName } from '../apps/api/src/proxy/split.ts';

const FILTER = 'outbound and tcp.DstPort == 443 and tcp.PayloadLength > 0';

// What the driver hands back beside each packet. Sixty-four bytes in WinDivert 2.
const ADDRESS_BYTES = 64;

const MAX_PACKET = 0xffff;

const HANDSHAKE = 0x16;

if (platform !== 'win32')
{
    console.log(`This needs the driver, and this machine runs ${platform}.`);
    process.exit(1);
}

const koffi = await import('koffi');
const library = koffi.load('WinDivert.dll');

const open = library.func('WinDivertOpen', 'void *', ['str', 'int', 'int16', 'uint64']);
const close = library.func('WinDivertClose', 'bool', ['void *']);

const recv = library.func('WinDivertRecv', 'bool',
    ['void *', 'void *', 'uint', koffi.out(koffi.pointer('uint')), 'void *']);

const send = library.func('WinDivertSend', 'bool',
    ['void *', 'void *', 'uint', koffi.out(koffi.pointer('uint')), 'void *']);

const fix = library.func('WinDivertHelperCalcChecksums', 'bool',
    ['void *', 'uint', 'void *', 'uint64']);

const handle = open(FILTER, 0, 0, 0);

if (handle === null || Number(handle) === -1)
{
    console.log('The driver did not start. Run this from an administrator PowerShell.');
    process.exit(1);
}

console.log('Watching. Open a site in a browser; Ctrl+C to stop.');
console.log(`Filter: ${FILTER}`);
console.log('');

let seen = 0;
let cut = 0;
let running = true;

process.on('SIGINT', () =>
{
    running = false;
    close(handle);

    console.log('');
    console.log(`Stopped. ${seen} packets seen, ${cut} cut in two.`);
    process.exit(0);
});

const packet = Buffer.alloc(MAX_PACKET);
const address = Buffer.alloc(ADDRESS_BYTES);
const length = [0];

while (running)
{
    if (!recv(handle, packet, MAX_PACKET, length, address))
    {
        continue;
    }

    seen += 1;

    const captured = packet.subarray(0, length[0]);
    const payload = payloadOf(captured);

    // Anything that is not a handshake goes back exactly as it came.
    if (payload === null || payload[0] !== HANDSHAKE)
    {
        send(handle, captured, captured.length, [0], address);
        continue;
    }

    const name = findName(payload);
    const at = name === -1 ? Math.floor(payload.length / 2) : name + 2;
    const pieces = splitPacket(captured, at);

    if (pieces === null)
    {
        send(handle, captured, captured.length, [0], address);
        continue;
    }

    // Their arithmetic on top of ours: the checksums are set twice rather than once,
    // and a packet the driver refuses is worse than a wasted microsecond.
    for (const piece of pieces)
    {
        fix(piece, piece.length, address, 0);
        send(handle, piece, piece.length, [0], address);
    }

    cut += 1;

    console.log(`cut a handshake of ${payload.length} bytes at ${at}`
        + `  (${pieces[0].length} + ${pieces[1].length} on the wire)`);
}

/** The bytes past the headers, or null when the packet is not shaped as expected. */
function payloadOf(captured)
{
    if (captured.length < 40 || (captured[0] >> 4) !== 4 || captured[9] !== 6)
    {
        return null;
    }

    const ipLength = (captured[0] & 0x0f) * 4;
    const tcpLength = (captured[ipLength + 12] >> 4) * 4;
    const at = ipLength + tcpLength;

    return at >= captured.length ? null : captured.subarray(at);
}
