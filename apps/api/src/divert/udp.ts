/**
 * Voice and video leave over UDP, where none of the work done for TCP applies: no
 * sequence numbers to move, no stream to reassemble, nothing to cut. A datagram is a
 * header and a payload, and the only trick left is the copy sent ahead of it.
 */

import { checksum } from './packet.ts';

const IPV4 = 4;

const UDP = 17;

const TTL_AT = 8;

const IP_CHECKSUM_AT = 10;

export interface Datagram
{
    ipHeaderLength: number;
    udpHeaderAt: number;
    payloadAt: number;
    payloadLength: number;
    fromPort: number;
    toPort: number;
}

/** Reads only what is needed to build a copy, and says so when it cannot. */
export function readDatagram(packet: Buffer): Datagram | null
{
    if (packet.length < 20 || ((packet[0] ?? 0) >> 4) !== IPV4)
    {
        return null;
    }

    const ipHeaderLength = ((packet[0] ?? 0) & 0x0f) * 4;

    if (ipHeaderLength < 20 || packet.length < ipHeaderLength + 8)
    {
        return null;
    }

    if (packet[9] !== UDP)
    {
        return null;
    }

    const payloadAt = ipHeaderLength + 8;

    // The transport header carries its own length, and it counts itself.
    const carried = packet.readUInt16BE(ipHeaderLength + 4) - 8;

    return {
        ipHeaderLength,
        udpHeaderAt: ipHeaderLength,
        payloadAt,
        payloadLength: Math.max(0, Math.min(carried, packet.length - payloadAt)),
        fromPort: packet.readUInt16BE(ipHeaderLength),
        toPort: packet.readUInt16BE(ipHeaderLength + 2),
    };
}

/**
 * Nothing here is spoiled the way a segment is: an unexpected datagram on a media
 * port is discarded by whatever is listening, and that is enough. A short life can
 * be asked for anyway.
 */
export function fakedDatagram(packet: Buffer, contents: Buffer, ttl?: number): Buffer | null
{
    const read = readDatagram(packet);

    if (read === null || contents.length === 0)
    {
        return null;
    }

    const built = Buffer.concat([packet.subarray(0, read.payloadAt), contents]);

    built.writeUInt16BE(built.length, 2);
    built.writeUInt16BE(contents.length + 8, read.udpHeaderAt + 4);

    if (ttl !== undefined)
    {
        built[TTL_AT] = Math.max(1, Math.min(ttl, 255));
    }

    built.writeUInt16BE(0, IP_CHECKSUM_AT);
    built.writeUInt16BE(checksum(built.subarray(0, read.ipHeaderLength)), IP_CHECKSUM_AT);
    built.writeUInt16BE(datagramChecksum(built, read), read.udpHeaderAt + 6);

    return built;
}

/**
 * Zero means the sum was never computed, so a zero result is written as ones. Both
 * stand for the same number and only one of them is a claim.
 */
export function datagramChecksum(packet: Buffer, read: Datagram): number
{
    const segment = packet.subarray(read.udpHeaderAt);

    const pseudo = Buffer.alloc(12);

    packet.copy(pseudo, 0, 12, 20);
    pseudo[8] = 0;
    pseudo[9] = UDP;
    pseudo.writeUInt16BE(segment.length, 10);

    const zeroed = Buffer.from(segment);

    zeroed.writeUInt16BE(0, 6);

    const sum = checksum(Buffer.concat([pseudo, zeroed]));

    return sum === 0 ? 0xffff : sum;
}
