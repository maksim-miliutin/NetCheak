/**
 * Splitting a packet is not splitting a write. Two packets have to be two whole
 * packets: each with its own lengths, its own sequence number and its own checksums,
 * or the far end drops both and the connection dies rather than gets through.
 *
 * Everything here works on bytes and is tested on bytes. The driver that hands these
 * packets over lives on the other side of a boundary this cannot reach.
 */

const IPV4 = 4;

const TCP = 6;

export interface Packet
{
    /** Where the address header ends and the transport header begins. */
    ipHeaderAt: number;
    ipHeaderLength: number;
    tcpHeaderAt: number;
    tcpHeaderLength: number;
    payloadAt: number;
    payloadLength: number;
    sequence: number;
}

/** Reads only what is needed to cut the packet up, and says so when it cannot. */
export function readPacket(packet: Buffer): Packet | null
{
    if (packet.length < 20)
    {
        return null;
    }

    const version = (packet[0] ?? 0) >> 4;

    if (version !== IPV4)
    {
        return null;
    }

    const ipHeaderLength = ((packet[0] ?? 0) & 0x0f) * 4;

    if (ipHeaderLength < 20 || packet.length < ipHeaderLength + 20)
    {
        return null;
    }

    if (packet[9] !== TCP)
    {
        return null;
    }

    const tcpHeaderAt = ipHeaderLength;
    const tcpHeaderLength = ((packet[tcpHeaderAt + 12] ?? 0) >> 4) * 4;

    if (tcpHeaderLength < 20 || packet.length < tcpHeaderAt + tcpHeaderLength)
    {
        return null;
    }

    const payloadAt = tcpHeaderAt + tcpHeaderLength;
    const total = packet.readUInt16BE(2);

    return {
        ipHeaderAt: 0,
        ipHeaderLength,
        tcpHeaderAt,
        tcpHeaderLength,
        payloadAt,
        payloadLength: Math.max(0, Math.min(packet.length, total) - payloadAt),
        sequence: packet.readUInt32BE(tcpHeaderAt + 4),
    };
}

/**
 * Two packets carrying between them what one carried. The second continues the first
 * in sequence, or the far end takes it as a retransmission and throws it away.
 */
export function splitPacket(packet: Buffer, at: number): [Buffer, Buffer] | null
{
    const read = readPacket(packet);

    if (read === null || read.payloadLength < 2)
    {
        return null;
    }

    const cut = Math.max(1, Math.min(at, read.payloadLength - 1));

    const first = rebuild(packet, read, 0, cut);
    const second = rebuild(packet, read, cut, read.payloadLength - cut);

    return [first, second];
}

/** One packet holding a slice of the payload, with every length and number set. */
function rebuild(packet: Buffer, read: Packet, from: number, length: number): Buffer
{
    const headers = packet.subarray(0, read.payloadAt);
    const slice = packet.subarray(read.payloadAt + from, read.payloadAt + from + length);
    const built = Buffer.concat([Buffer.from(headers), slice]);

    // The address header says how long the whole packet is, counting itself.
    built.writeUInt16BE(built.length, 2);

    // The second packet begins where the first left off.
    built.writeUInt32BE((read.sequence + from) >>> 0, read.tcpHeaderAt + 4);

    // A checksum computed over the old contents describes a packet that no longer
    // exists, and every hop on the way will discard it.
    built.writeUInt16BE(0, 10);
    built.writeUInt16BE(0, read.tcpHeaderAt + 16);

    built.writeUInt16BE(checksum(built.subarray(0, read.ipHeaderLength)), 10);
    built.writeUInt16BE(tcpChecksum(built, read), read.tcpHeaderAt + 16);

    return built;
}

/** The ones complement sum every header on the way expects to find. */
export function checksum(bytes: Buffer): number
{
    let sum = 0;

    for (let i = 0; i + 1 < bytes.length; i += 2)
    {
        sum += bytes.readUInt16BE(i);
    }

    if (bytes.length % 2 === 1)
    {
        sum += (bytes[bytes.length - 1] ?? 0) << 8;
    }

    while (sum > 0xffff)
    {
        sum = (sum & 0xffff) + (sum >>> 16);
    }

    return (~sum) & 0xffff;
}

/**
 * The transport checksum covers a made-up header of addresses and lengths as well as
 * the segment itself, which is why it cannot simply be copied from the packet that
 * was cut up.
 */
export function tcpChecksum(packet: Buffer, read: Packet): number
{
    const segment = packet.subarray(read.tcpHeaderAt);

    const pseudo = Buffer.alloc(12);

    packet.copy(pseudo, 0, 12, 20);
    pseudo[8] = 0;
    pseudo[9] = TCP;
    pseudo.writeUInt16BE(segment.length, 10);

    return checksum(Buffer.concat([pseudo, segment]));
}
