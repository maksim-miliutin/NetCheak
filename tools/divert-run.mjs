/**
 * The loop. It asks the driver for packets, cuts the ones carrying a handshake into
 * two, and hands both back. Everything else is passed along untouched.
 *
 * Run it from a PowerShell opened as administrator, then open a site in a browser and
 * watch what it says. Stop it with Ctrl+C: the driver is closed on the way out, and a
 * driver left open holds traffic that nothing is reading.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { platform } from 'node:process';
import { decide } from '../apps/api/src/divert/handle.ts';
import { filterFor } from '../apps/api/src/divert/filter.ts';

// What the profile that works on this machine does, put here as the default: six
// copies of a recorded hello, sent ahead, and the real one left whole. Splitting is
// a different trick against a different filter and is off unless asked for.
const FOOLING = ['badsum', 'badseq', 'ttl'];

const said = new Map(process.argv.slice(2).map((one) =>
{
    const at = one.indexOf('=');

    return at === -1 ? [one, 'yes'] : [one.slice(0, at), one.slice(at + 1)];
}));

const asked = said.get('fooling') ?? 'badsum';

if (asked !== 'none' && !FOOLING.includes(asked))
{
    console.log(`fooling= takes one of: ${FOOLING.join(', ')}, none. Not ${asked}.`);
    process.exit(1);
}

const TTL = Number(said.get('ttl') ?? 6);
const REPEATS = Number(said.get('repeats') ?? 6);
const CUT = (said.get('cut') ?? 'no') === 'yes';

// Walks everything but the driver, so the loop can be run where there is no driver.
const DRY = said.get('dry') === 'yes';

// Parts of names to keep to. Without this the copies go to every site the machine
// speaks to, and the first run of it had ordinary sites retrying in a loop.
const ONLY = (said.get('only') ?? '').split(',').map((one) => one.trim())
    .filter((one) => one !== '');

// A hello recorded from an ordinary site. Zapret ships several; pointing this at one
// of them is faster than arguing about what a convincing hello looks like.
const HELLO = said.has('hello') ? readFileSync(said.get('hello')) : null;

// A datagram recorded from a working call. Without one the voice ports are watched
// and let through, which is the same as not watching them.
const VOICE = said.has('voice') ? readFileSync(said.get('voice')) : null;

// Voice leaves fifty times a second. Copying every one of those is more noise on the
// line than the voice itself, and the line is what the voice needs.
const CUTOFF = Number(said.get('cutoff') ?? 2);

// The ports a call is actually carried on, found by watching rather than guessed:
// 19306 in the log, inside the range a game filter had listed all along.
const VOICE_PORTS = (said.get('voiceports') ?? '19294-19344').split('-').map(Number);

/**
 * Recording rather than helping. The copies sent ahead of a hello have to carry
 * somebody else's ordinary one, and until now that came out of another program's
 * folder: nothing to hand to anybody who does not already have it installed.
 * One connection to an ordinary site is all it takes to have one of our own.
 */
const RECORD = said.get('record') ?? '';

const FOR = said.get('for') ?? '';

const INTO = said.get('into') ?? '';

/**
 * The smallest thing worth recording. A call opens with a packet asking what its own
 * address is and keeps itself alive with eight bytes at a time; both arrive before a
 * word is said, and neither is a lure — there is nothing in eight bytes for a filter
 * to read. Speech, when it comes, is a couple of hundred.
 */
const LEAST = Number(said.get('least') ?? (RECORD === 'voice' ? 100 : 200));

if (RECORD !== '' && (!['hello', 'voice'].includes(RECORD) || INTO === ''))
{
    console.log('record= takes hello or voice, and into= where to put it.');
    console.log('For a hello, say for=www.example.com and then open that site.');
    process.exit(1);
}

const helped = new Map();

// Prints what went by untouched as well as what was helped. Without it the log says
// only what this program did, and never what it saw and left alone.
const SHOW_ALL = said.get('show') === 'all';

// The ports voice and video leave by. A call is given one of these by the far end,
// and nothing in a datagram says which call it belongs to, so a range is the filter.
// Taken narrow at first from somebody else's settings, and the voice went past it.
const [FROM, TO] = (said.get('udp') ?? '50000-65535').split('-').map(Number);

// A packet this program sends comes back through this same filter, and a copy of a
// copy is what the log filled up with: the driver marks its own injections, so they
// are refused by name here rather than sorted out afterwards.
// Both ends are checked. A call is given a port by the far end and answers from one
// of its own, and only the near one turned out to be high: watching the far end alone
// let every datagram of a call go by unseen.
const FILTER = filterFor({ from: FROM, to: TO });

// The name written into copies built by rewriting, which is what happens when no
// recorded hello was given. A packet carrying it is taken for one of ours.
// The name written into a copy when no recording carries one. A filter follows a
// copy it has no objection to, and how sure that is decides whether this works at
// all: a name everybody reaches for a hundred times a day is one nobody decides
// about. The search tries several; by hand, name= picks one.
const DECOY_NAME = said.get('name') ?? 'www.gosuslugi.ru';

// What the driver hands back beside each packet. Sixty-four bytes in WinDivert 2.
const ADDRESS_BYTES = 64;

const MAX_PACKET = 0xffff;

// WinDivertOpen answers with -1 rather than with nothing when it refuses, and koffi
// hands a pointer back as an opaque object: converting one to a number throws instead
// of comparing. Only its address can be looked at, and only as a whole number.
const NOT_A_HANDLE = 0xffffffffffffffffn;

function refused(handle)
{
    return handle === null || BigInt(koffi.address(handle)) === NOT_A_HANDLE;
}

/**
 * Everything below the driver, run on a hello made up here. Three times now this file
 * has been handed over with a name declared twice or a constant deleted, and none of
 * it showed until somebody with Windows ran it: the loop is the one part of this
 * project that no test could reach. This reaches it.
 */
if (DRY)
{
    const hello = Buffer.concat(
    [
        Buffer.from([0x16, 0x03, 0x01, 0x00, 0x00]),
        Buffer.alloc(60, 0x11),
        Buffer.from([0x00, 0x00, 0x00, 0x10, 0x00, 0x0e, 0x00, 0x00, 0x0b]),
        Buffer.from('discord.com', 'latin1'),
        Buffer.alloc(40, 0x22),
    ]);

    const headers = Buffer.alloc(40);

    headers[0] = 0x45;
    headers[8] = 64;
    headers[9] = 6;
    headers.writeUInt16BE(40 + hello.length, 2);
    headers.writeUInt32BE(0xc0a80101, 12);
    headers.writeUInt32BE(0x08080808, 16);
    headers.writeUInt16BE(50000, 40 - 20);
    headers.writeUInt16BE(443, 42 - 20);
    headers.writeUInt32BE(1000, 44 - 20);
    headers[52 - 20] = 5 << 4;

    const made = Buffer.concat([headers, hello]);

    const done = decide(made,
    {
        fooling: asked, ttl: TTL, decoyName: DECOY_NAME, repeats: REPEATS,
        hello: HELLO, cut: CUT, only: ONLY, datagram: VOICE, cutoff: CUTOFF, helped,
        voicePorts: VOICE_PORTS,
    });

    console.log(`Dry run on a made-up hello for ${done.name}.`);
    console.log(`  ${done.decoys.length} copies of `
        + `${done.decoys[0]?.length ?? 0} bytes would go first.`);
    console.log(`  then ${done.pieces === null
        ? `the hello whole, ${made.length} bytes`
        : `${done.pieces[0].length} + ${done.pieces[1].length} bytes`}.`);

    const datagram = Buffer.alloc(28 + 120);

    datagram[0] = 0x45;
    datagram[8] = 64;
    datagram[9] = 17;
    datagram.writeUInt16BE(datagram.length, 2);
    datagram.writeUInt32BE(0xc0a80101, 12);
    datagram.writeUInt32BE(0x08080808, 16);
    datagram.writeUInt16BE(60000, 20);
    datagram.writeUInt16BE(19306, 22);
    datagram.writeUInt16BE(8 + 120, 24);

    const voice = decide(datagram,
    {
        fooling: asked, ttl: TTL, decoyName: DECOY_NAME, repeats: REPEATS,
        hello: HELLO, cut: CUT, only: ONLY, datagram: VOICE, cutoff: CUTOFF, helped,
        voicePorts: VOICE_PORTS,
    });

    console.log(`Dry run on a made-up datagram to ${voice.name ?? 'a voice port'}.`);
    console.log(`  ${voice.decoys.length} copies of `
        + `${voice.decoys[0]?.length ?? 0} bytes would go first, then the real one.`);
    process.exit(0);
}

if (platform !== 'win32')
{
    console.log(`This needs the driver, and this machine runs ${platform}.`);
    console.log('Add dry=yes to walk the same path without one.');
    process.exit(1);
}

// koffi is CommonJS: the library is under default, and whether it also appears at
// the top of the namespace depends on the version of Node reading it.
const loaded = await import('koffi');
const koffi = loaded.default ?? loaded;

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

if (refused(handle))
{
    console.log('The driver did not start. Run this from an administrator PowerShell.');
    process.exit(1);
}

/**
 * What this run is going to do, said before it starts doing it. The first recording
 * made this way came out a name lookup, and the lines above it were still claiming
 * six copies were being sent: nothing was, and nothing should have been.
 */
console.log(`Filter: ${FILTER}`);
console.log(`Datagrams with either end between ${FROM} and ${TO} are watched.`);

if (RECORD === 'hello')
{
    console.log(`Recording one hello${FOR === '' ? '' : ` for ${FOR}`}. `
        + 'Open that site now.');
    console.log('Record it from a site that opens: the name in the copy has to be one '
        + `nobody blocks, or the copy is no lure at all. At least ${LEAST} bytes.`);
    console.log('Only a hello that ends inside one packet is taken. A big one is sent '
        + 'in two, and half a hello is a worse lure than none.');
}

if (RECORD === 'voice')
{
    console.log('Recording one datagram of a call. Join a voice channel and say '
        + 'something: it is speech that is being recorded.');
    console.log(`Only a datagram to ports ${VOICE_PORTS[0]} through ${VOICE_PORTS[1]} `
        + `and at least ${LEAST} bytes long counts: a call asks its own address and `
        + 'keeps itself alive in eight bytes, and neither is worth copying.');
}

if (RECORD !== '')
{
    console.log('Nothing is helped meanwhile. A hello that was helped is not the one '
        + 'the browser sent, so blocked sites stay blocked until this is done.');
}
else
{
    console.log('Watching. Open a site in a browser; Ctrl+C to stop.');

    console.log(asked === 'none'
        ? 'No copies; the hello is only cut.'
        : `${REPEATS} copies spoiled by ${asked}`
            + `${asked === 'ttl' ? `, ${TTL} hops` : ''}`
            + `${HELLO === null ? ', name rewritten' : `, ${HELLO.length} recorded bytes`}`
            + `. Real hello ${CUT ? 'cut in two' : 'left whole'}.`);

    console.log(VOICE === null
        ? 'Voice is watched and let through: nothing was recorded to send ahead of it.'
        : `Voice gets the same ${REPEATS} copies, of ${VOICE.length} recorded bytes, `
            + `for the first ${CUTOFF} datagrams of each call, `
            + `and only to ports ${VOICE_PORTS[0]} through ${VOICE_PORTS[1]}.`);

    console.log(ONLY.length === 0
        ? 'For every site this machine talks to, which is more than any of them asked '
            + 'for.'
        : `For names holding: ${ONLY.join(', ')}. Everything else goes by untouched.`);
}
console.log('');

let seen = 0;
let decoys = 0;

const counted = { helped: 0, passed: 0, returned: 0 };
let running = true;

process.on('SIGINT', () =>
{
    running = false;
    close(handle);

    console.log('');
    console.log(`Stopped. ${seen} packets seen, ${counted.helped} helped along, `
        + `${decoys} copies sent, ${counted.returned} of those came back, `
        + `${counted.passed} passed untouched.`);
    process.exit(0);
});

/**
 * A hello that ends inside this packet. A record says its own length in the two bytes
 * after the type and the version, and a hello too big for one packet is sent in two:
 * recording the first half gives a copy that ends mid-sentence, which is a worse lure
 * than none. The one recorded from ya.ru was 1398 bytes — a first half.
 */
function whole(payload)
{
    if (RECORD !== 'hello')
    {
        return true;
    }

    return payload.length === 5 + ((payload[3] << 8) + payload[4]);
}

/** The one being recorded: a named hello for the site asked for, or any datagram. */
function wanted(name)
{
    if (name === null)
    {
        return false;
    }

    if (RECORD !== 'voice')
    {
        return !name.startsWith('udp:') && (FOR === '' || name.includes(FOR));
    }

    // Every name lookup leaves from a high port too, and the first thing recorded
    // this way was a question to a name server rather than a word of a call.
    const to = Number(name.split('->')[1] ?? 0);

    return name.startsWith('udp:') && to >= VOICE_PORTS[0] && to <= VOICE_PORTS[1];
}

const packet = Buffer.alloc(MAX_PACKET);
const address = Buffer.alloc(ADDRESS_BYTES);
// The driver writes how many bytes it handed over into this, so it is not a number.
const received = [0];

while (running)
{
    if (!recv(handle, packet, MAX_PACKET, received, address))
    {
        continue;
    }

    seen += 1;

    const captured = packet.subarray(0, received[0]);
    const done = decide(captured,
    {
        fooling: RECORD === '' ? asked : 'none',
        ttl: TTL, decoyName: DECOY_NAME, repeats: REPEATS,
        hello: RECORD === '' ? HELLO : null, cut: RECORD === '' && CUT, only: ONLY,
        datagram: RECORD === '' ? VOICE : null, cutoff: CUTOFF, helped,
        voicePorts: VOICE_PORTS,
    });

    // Nothing is done to a packet being recorded from: a hello that was helped is
    // not the hello that was sent, and a copy of one is worth nothing.
    // Said out loud when something was looked at and put back. Silence while nothing
    // is recorded reads as a tool that sees no traffic, and it sees plenty.
    if (RECORD !== '' && done.payload !== null && wanted(done.name)
        && !(done.payload.length >= LEAST && whole(done.payload)))
    {
        send(handle, captured, captured.length, [0], address);

        console.log(`${done.name}: ${done.payload.length} bytes, passed over — `
            + (done.payload.length < LEAST
                ? `under ${LEAST}`
                : 'a hello too big for one packet, so this is half of one'));

        continue;
    }

    if (RECORD !== '' && done.payload !== null && done.payload.length >= LEAST
        && wanted(done.name) && whole(done.payload))
    {
        send(handle, captured, captured.length, [0], address);
        writeFileSync(INTO, Buffer.from(done.payload));

        console.log(`Recorded ${done.payload.length} bytes from ${done.name} `
            + `into ${INTO}.`);
        close(handle);
        process.exit(0);
    }

    if (done.outcome !== 'helped')
    {
        counted[done.outcome] += 1;
        send(handle, captured, captured.length, [0], address);

        if (SHOW_ALL && done.name !== null)
        {
            console.log(`${done.name}: ${done.bytes} bytes, ${done.outcome}`);
        }

        continue;
    }

    // The copies go first, while the filter is still deciding what this connection
    // is, and go with the checksums they were given rather than mended ones.
    for (const copy of done.decoys)
    {
        send(handle, copy, copy.length, [0], address);
        decoys += 1;
    }

    // Their arithmetic on top of ours: the checksums are set twice rather than once,
    // and a packet the driver refuses is worse than a wasted microsecond.
    for (const piece of done.pieces ?? [captured])
    {
        fix(piece, piece.length, address, 0);
        send(handle, piece, piece.length, [0], address);
    }

    counted.helped += 1;

    console.log(`${done.name}: ${done.bytes} bytes, ${done.decoys.length} copies`
        + `${done.pieces === null ? '' : `, cut at ${done.at}`}`);
}

