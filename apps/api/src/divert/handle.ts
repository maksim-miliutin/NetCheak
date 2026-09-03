/**
 * What to do with one captured packet, decided without touching a driver. The loop
 * that talks to the driver cannot be run anywhere but Windows, and a mistake inside
 * it is found only by a person sitting at that machine — which is how a name declared
 * twice in one block got as far as it did.
 *
 * Everything here works on bytes and is tested on bytes.
 */

import { decoyPacket, fakedPacket, type Fooling } from './decoy.ts';
import { readPacket, splitPacket } from './packet.ts';
import { fakedDatagram, readDatagram } from './udp.ts';
import { findName } from '../proxy/split.ts';

const HANDSHAKE = 0x16;

export interface Handling
{
    fooling: Fooling | 'none';
    ttl: number;
    decoyName: string;
    repeats: number;
    /** A hello recorded elsewhere, sent instead of a rewritten copy of this one. */
    hello: Buffer | null;

    // Fake and cut are two tricks against two filters, and doing both is not doing
    // either one better.
    cut: boolean;

    // Everything not named here goes by untouched. Helping every site the machine
    // speaks to is six extra packets each to sites that never needed them.
    only: string[];

    datagram: Buffer | null;

    // A filter decides what a connection is from its first packets. Copying all fifty
    // a second is noise on the line the voice itself needs.
    cutoff: number;
    voicePorts: [number, number];
    helped: Map<string, number> | null;
}

export type Outcome = 'passed' | 'returned' | 'helped';

export interface Decided
{
    outcome: Outcome;
    /** Sent first and in order, each without a checksum fixed for it. */
    decoys: Buffer[];

    /** Both halves, needing their checksums set before they go, or nothing. */
    pieces: [Buffer, Buffer] | null;
    name: string | null;
    at: number | null;
    /** What it carried, so a copy can be recorded from a real one. */
    payload: Buffer | null;

    /** How much the hello carried, which is not the length of the packet. */
    bytes: number;
}

const nothing = (outcome: Outcome, name: string | null = null, bytes = 0,
    payload: Buffer | null = null): Decided =>
    ({ outcome, decoys: [], pieces: null, name, at: null, bytes, payload });

export function decide(captured: Buffer, how: Handling): Decided
{
    if (readDatagram(captured) !== null)
    {
        return decideDatagram(captured, how);
    }

    const read = readPacket(captured);

    if (read === null || read.payloadLength < 6)
    {
        return nothing('passed');
    }

    const payload = captured.subarray(read.payloadAt, read.payloadAt + read.payloadLength);

    if (payload[0] !== HANDSHAKE)
    {
        return nothing('passed');
    }

    const name = findName(payload);

    // The second half of a hello carries no name, so there is nothing here to cut
    // through and nothing a filter would read.
    if (name === -1)
    {
        return nothing('passed');
    }

    const length = ((payload[name - 2] ?? 0) << 8) + (payload[name - 1] ?? 0);
    const asked = payload.subarray(name, name + length).toString('latin1');

    // The name inside a recorded hello belongs to whoever was recorded, so only the
    // bytes say whether this one is ours come back around.
    if (how.hello !== null && payload.equals(how.hello))
    {
        return nothing('returned', asked, payload.length, payload);
    }

    if (ours(asked, how.decoyName))
    {
        return nothing('returned', asked, payload.length, payload);
    }

    if (how.only.length > 0 && !how.only.some((part) => asked.includes(part)))
    {
        return nothing('passed', asked, payload.length, payload);
    }

    const decoys: Buffer[] = [];

    if (how.fooling !== 'none')
    {
        const one = how.hello === null
            ? decoyPacket(captured, { fooling: how.fooling, at: name, length,
                ttl: how.ttl, name: how.decoyName })
            : fakedPacket(captured, how.hello, { fooling: how.fooling, ttl: how.ttl });

        for (let i = 0; one !== null && i < Math.max(1, how.repeats); i += 1)
        {
            decoys.push(one);
        }
    }

    const pieces = how.cut ? splitPacket(captured, name + 2) : null;

    if (decoys.length === 0 && pieces === null)
    {
        return nothing('passed', asked, payload.length, payload);
    }

    return { outcome: 'helped', decoys, pieces, name: asked,
        at: pieces === null ? null : name + 2, bytes: payload.length, payload };
}

/** A datagram has no name in it, so the port is all there is to decide by. */
function decideDatagram(captured: Buffer, how: Handling): Decided
{
    const read = readDatagram(captured);

    if (read === null || read.payloadLength === 0)
    {
        return nothing('passed');
    }

    // Both ends: which of the two holds the high port is not knowable beforehand, and
    // watching the wrong one left a whole log without a single datagram in it.
    const port = `udp:${read.fromPort}->${read.toPort}`;
    const carried = captured.subarray(read.payloadAt, read.payloadAt + read.payloadLength);

    const [lowest, highest] = how.voicePorts;

    if (how.datagram === null || read.toPort < lowest || read.toPort > highest)
    {
        return nothing('passed', port, read.payloadLength, carried);
    }

    const to = `${captured.readUInt32BE(16)}:${read.toPort}`;
    const already = how.helped?.get(to) ?? 0;

    if (how.cutoff > 0 && already >= how.cutoff)
    {
        return nothing('passed', port, read.payloadLength, carried);
    }

    // Ours, come back around. Nothing but the contents says so.
    if (carried.equals(how.datagram))
    {
        return nothing('returned', port, read.payloadLength, carried);
    }

    const one = fakedDatagram(captured, how.datagram,
        how.fooling === 'ttl' ? how.ttl : undefined);

    if (one === null)
    {
        return nothing('passed', port, read.payloadLength, carried);
    }

    const decoys: Buffer[] = [];

    for (let i = 0; i < Math.max(1, how.repeats); i += 1)
    {
        decoys.push(one);
    }

    how.helped?.set(to, already + 1);

    return { outcome: 'helped', decoys, pieces: null, name: port, at: null,
        bytes: read.payloadLength, payload: carried };
}

/**
 * A copy carries its name at the length of the name it replaced, so a short field
 * holds only the beginning of it and a long one holds all of it with filler after.
 * Neither side of the comparison can be the fixed one.
 */
export function ours(name: string, decoyName: string): boolean
{
    return name.length > 0
        && (decoyName.startsWith(name) || name.startsWith(decoyName));
}
