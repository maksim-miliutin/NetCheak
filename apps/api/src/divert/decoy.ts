/**
 * A copy sent ahead of the real hello, carrying another name and spoiled so it never
 * arrives. The filter reads the copy and follows it; the far end throws it away.
 *
 * An ordinary socket cannot send a packet that is deliberately wrong, which is why
 * this belongs to the driver rather than to the proxy.
 */

import { checksum, readPacket, tcpChecksum, type Packet } from './packet.ts';

/** How the copy is spoiled, which decides what kind of filter it fools. */
export type Fooling = 'badsum' | 'badseq' | 'ttl';

export interface Decoy
{
    fooling: Fooling;

    /** Where the name sits, when the copy is a rewrite rather than a recording. */
    at?: number;
    length?: number;
    ttl?: number;
    name?: string;
}

const TTL_AT = 8;

const IP_CHECKSUM_AT = 10;

const DEFAULT_TTL = 6;

const DEFAULT_NAME = 'www.microsoft.com';

/**
 * The name is written over the old one at the same length, so every length around it
 * inside the hello stays true and the copy reads as an ordinary one.
 */
export function decoyPacket(packet: Buffer, decoy: Decoy): Buffer | null
{
    const read = readPacket(packet);

    const length = decoy.length ?? 0;

    if (read === null || length <= 0)
    {
        return null;
    }

    const from = read.payloadAt + (decoy.at ?? 0);

    if (from + length > packet.length)
    {
        return null;
    }

    const built = Buffer.from(packet);

    written(decoy.name ?? DEFAULT_NAME, length).copy(built, from);

    return spoiled(built, read, decoy);
}

/** Every way of making a packet that travels and is then refused at the far end. */
function spoiled(built: Buffer, read: Packet, decoy: Decoy): Buffer
{
    if (decoy.fooling === 'ttl')
    {
        built[TTL_AT] = Math.max(1, Math.min(decoy.ttl ?? DEFAULT_TTL, 255));
    }

    if (decoy.fooling === 'badseq')
    {
        // Far enough back that the far end takes it for something it has already had
        // and drops it, while a filter watching the stream still reads it.
        built.writeUInt32BE((read.sequence - 0x40000000) >>> 0, read.tcpHeaderAt + 4);
    }

    built.writeUInt16BE(0, IP_CHECKSUM_AT);
    built.writeUInt16BE(0, read.tcpHeaderAt + 16);

    // The address header is summed by every hop on the way, so it has to be right
    // even here: a copy discarded at the first router is a copy no filter ever saw.
    built.writeUInt16BE(checksum(built.subarray(0, read.ipHeaderLength)), IP_CHECKSUM_AT);
    built.writeUInt16BE(tcpChecksum(built, read), read.tcpHeaderAt + 16);

    if (decoy.fooling === 'badsum')
    {
        // Only the far end checks this one. Flipping it after the fact leaves the
        // packet routable and unacceptable, which is the whole point.
        const sum = built.readUInt16BE(read.tcpHeaderAt + 16);

        built.writeUInt16BE(sum ^ 0xffff, read.tcpHeaderAt + 16);
    }

    return built;
}

/**
 * A copy carrying a hello recorded elsewhere. A rewritten name leaves everything else
 * about the packet the same, and a filter that has seen a few of those knows them.
 */
export function fakedPacket(packet: Buffer, hello: Buffer, decoy: Decoy): Buffer | null
{
    const read = readPacket(packet);

    if (read === null || hello.length === 0)
    {
        return null;
    }

    const built = Buffer.concat([packet.subarray(0, read.payloadAt), hello]);

    // The address header counts itself, and this packet is a different length from
    // the one its headers came off.
    built.writeUInt16BE(built.length, 2);

    return spoiled(built, read, decoy);
}

/** The name to write, cut or repeated until it is exactly as long as the old one. */
function written(name: string, length: number): Buffer
{
    const bytes = Buffer.from(name, 'latin1');

    if (bytes.length >= length)
    {
        return bytes.subarray(0, length);
    }

    const filled = Buffer.alloc(length, 0x61);

    bytes.copy(filled);

    return filled;
}
