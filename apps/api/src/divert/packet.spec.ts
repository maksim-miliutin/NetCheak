import { describe, expect, it } from 'vitest';
import { checksum, readPacket, splitPacket, tcpChecksum } from './packet.ts';

/** A packet built by hand, so every field under test is one this test chose. */
function build(payload: Buffer, sequence = 1000): Buffer
{
    const ip = Buffer.alloc(20);

    ip[0] = 0x45;
    ip[9] = 6;
    ip.writeUInt16BE(20 + 20 + payload.length, 2);
    ip.writeUInt32BE(0xc0a80101, 12);
    ip.writeUInt32BE(0x08080808, 16);

    const tcp = Buffer.alloc(20);

    tcp.writeUInt16BE(50000, 0);
    tcp.writeUInt16BE(443, 2);
    tcp.writeUInt32BE(sequence, 4);
    tcp[12] = 5 << 4;

    return Buffer.concat([ip, tcp, payload]);
}

const HELLO = Buffer.from('0123456789abcdefghij');

describe('readPacket', () =>
{
    it('finds where each header ends', () =>
    {
        const read = readPacket(build(HELLO));

        expect(read?.ipHeaderLength).toBe(20);
        expect(read?.tcpHeaderLength).toBe(20);
        expect(read?.payloadAt).toBe(40);
        expect(read?.payloadLength).toBe(HELLO.length);
    });

    it('reads the sequence number the segment starts at', () =>
    {
        expect(readPacket(build(HELLO, 7777))?.sequence).toBe(7777);
    });

    it.each([
        ['too short to hold a header', Buffer.alloc(10)],
        ['not the fourth version', Buffer.concat([Buffer.from([0x65]), Buffer.alloc(40)])],
    ])('refuses something %s', (_name, bytes) =>
    {
        expect(readPacket(bytes)).toBeNull();
    });

    // Only this transport is being cut up; anything else must be passed along whole.
    it('refuses a packet carrying something other than tcp', () =>
    {
        const other = build(HELLO);

        other[9] = 17;

        expect(readPacket(other)).toBeNull();
    });
});

describe('checksum', () =>
{
    // A header whose checksum is right sums to nothing when the sum includes it.
    it('gives a sum that checks out against itself', () =>
    {
        const header = build(HELLO).subarray(0, 20);

        header.writeUInt16BE(0, 10);
        header.writeUInt16BE(checksum(header), 10);

        expect(checksum(header)).toBe(0);
    });

    it('copes with an odd number of bytes', () =>
    {
        expect(() => checksum(Buffer.from([1, 2, 3]))).not.toThrow();
    });
});

describe('splitPacket', () =>
{
    const packet = build(HELLO);
    const split = splitPacket(packet, 8);

    it('gives back two packets', () =>
    {
        expect(split).not.toBeNull();
        expect(split).toHaveLength(2);
    });

    // Between them they must carry what the one carried, or the far end is missing
    // bytes it will wait for forever.
    it('carries the whole payload between them', () =>
    {
        const [first, second] = split ?? [];
        const carried = Buffer.concat([first?.subarray(40) ?? Buffer.alloc(0),
            second?.subarray(40) ?? Buffer.alloc(0)]);

        expect(carried.equals(HELLO)).toBe(true);
    });

    it('cuts where it was asked to', () =>
    {
        expect(split?.[0].subarray(40).length).toBe(8);
        expect(split?.[1].subarray(40).length).toBe(HELLO.length - 8);
    });

    // The second continues the first, or it is taken for a retransmission and dropped.
    it('continues the sequence in the second packet', () =>
    {
        expect(split?.[1].readUInt32BE(24)).toBe(1000 + 8);
        expect(split?.[0].readUInt32BE(24)).toBe(1000);
    });

    it('says in each header how long that packet is', () =>
    {
        for (const one of split ?? [])
        {
            expect(one.readUInt16BE(2)).toBe(one.length);
        }
    });

    // A checksum describing the packet that was cut up would be discarded at the
    // first hop, and nothing would arrive at all.
    it('gives each packet a checksum that checks out', () =>
    {
        for (const one of split ?? [])
        {
            expect(checksum(one.subarray(0, 20))).toBe(0);

            const read = readPacket(one);

            expect(read).not.toBeNull();

            if (read !== null)
            {
                expect(tcpChecksum(one, read)).toBe(0);
            }
        }
    });

    it('never cuts away the whole of either side', () =>
    {
        expect(splitPacket(build(HELLO), 0)?.[0].subarray(40).length).toBe(1);
        expect(splitPacket(build(HELLO), 999)?.[1].subarray(40).length).toBe(1);
    });

    it('refuses a packet with nothing to cut', () =>
    {
        expect(splitPacket(build(Buffer.from('a')), 1)).toBeNull();
        expect(splitPacket(Buffer.alloc(10), 1)).toBeNull();
    });
});
