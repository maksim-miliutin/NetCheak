import { describe, expect, it } from 'vitest';
import { decoyPacket } from './decoy.ts';
import { checksum, readPacket, tcpChecksum } from './packet.ts';

/** A packet built by hand, so every field under test is one this test chose. */
function build(payload: Buffer, sequence = 1000): Buffer
{
    const ip = Buffer.alloc(20);

    ip[0] = 0x45;
    ip[8] = 64;
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

// A payload with a name in the middle of it, at a position the tests can name.
const NAME_AT = 8;

const NAME = 'discord.com';

const PAYLOAD = Buffer.concat(
[
    Buffer.alloc(NAME_AT, 0x16),
    Buffer.from(NAME, 'latin1'),
    Buffer.alloc(12, 0x22),
]);

/** A checksum that is right sums to nothing when the field itself is counted in. */
function addressSumIsRight(packet: Buffer): boolean
{
    return checksum(packet.subarray(0, 20)) === 0;
}

function segmentSumIsRight(packet: Buffer): boolean
{
    const read = readPacket(packet);

    return read !== null && tcpChecksum(packet, read) === 0;
}

const nameIn = (packet: Buffer): string =>
    packet.subarray(40 + NAME_AT, 40 + NAME_AT + NAME.length).toString('latin1');

describe('decoyPacket', () =>
{
    it('writes another name over the one that was there', () =>
    {
        const decoy = decoyPacket(build(PAYLOAD),
            { fooling: 'badsum', at: NAME_AT, length: NAME.length, name: 'example.org' });

        expect(nameIn(decoy!)).toBe('example.org');
    });

    it('keeps the packet exactly as long as it was', () =>
    {
        const packet = build(PAYLOAD);
        const decoy = decoyPacket(packet,
            { fooling: 'badsum', at: NAME_AT, length: NAME.length });

        expect(decoy?.length).toBe(packet.length);
    });

    // The lengths inside a hello describe the name, so a shorter one would leave the
    // record describing bytes that are not there and a filter would see it at once.
    it('pads a shorter name out to the length of the old one', () =>
    {
        const decoy = decoyPacket(build(PAYLOAD),
            { fooling: 'badsum', at: NAME_AT, length: NAME.length, name: 'a.io' });

        expect(nameIn(decoy!)).toHaveLength(NAME.length);
        expect(nameIn(decoy!).startsWith('a.io')).toBe(true);
    });

    it('cuts a longer name down rather than running past the room for it', () =>
    {
        const decoy = decoyPacket(build(PAYLOAD),
            { fooling: 'badsum', at: NAME_AT, length: NAME.length,
                name: 'a-very-long-name-indeed.example.com' });

        expect(nameIn(decoy!)).toHaveLength(NAME.length);
    });

    it('leaves the address header summed correctly, whatever the spoiling', () =>
    {
        for (const fooling of ['badsum', 'badseq', 'ttl'] as const)
        {
            const decoy = decoyPacket(build(PAYLOAD), { fooling, at: NAME_AT,
                length: NAME.length });

            expect(addressSumIsRight(decoy!)).toBe(true);
        }
    });

    it('spoils only the segment sum when that is what was asked for', () =>
    {
        const decoy = decoyPacket(build(PAYLOAD),
            { fooling: 'badsum', at: NAME_AT, length: NAME.length });

        expect(segmentSumIsRight(decoy!)).toBe(false);
        expect(addressSumIsRight(decoy!)).toBe(true);
    });

    it('shortens the life of the copy when distance is what spoils it', () =>
    {
        const decoy = decoyPacket(build(PAYLOAD),
            { fooling: 'ttl', at: NAME_AT, length: NAME.length, ttl: 5 });

        expect(decoy?.[8]).toBe(5);
        expect(segmentSumIsRight(decoy!)).toBe(true);
    });

    it('sends the copy back in the stream when a stale number spoils it', () =>
    {
        const packet = build(PAYLOAD, 1000);
        const decoy = decoyPacket(packet,
            { fooling: 'badseq', at: NAME_AT, length: NAME.length });

        expect(decoy?.readUInt32BE(24)).not.toBe(1000);
        expect(segmentSumIsRight(decoy!)).toBe(true);
    });

    it('leaves the real sequence number alone unless a stale one was asked for', () =>
    {
        for (const fooling of ['badsum', 'ttl'] as const)
        {
            const decoy = decoyPacket(build(PAYLOAD, 1000), { fooling, at: NAME_AT,
                length: NAME.length });

            expect(decoy?.readUInt32BE(24)).toBe(1000);
        }
    });

    it('says nothing when the name would sit past the end of the packet', () =>
    {
        expect(decoyPacket(build(PAYLOAD), { fooling: 'badsum', at: 100, length: 20 }))
            .toBeNull();
    });

    it('says nothing when there is no name to write over', () =>
    {
        expect(decoyPacket(build(PAYLOAD), { fooling: 'badsum', at: 0, length: 0 }))
            .toBeNull();
    });

    it('says nothing about a packet it cannot read', () =>
    {
        expect(decoyPacket(Buffer.alloc(10), { fooling: 'badsum', at: 0, length: 4 }))
            .toBeNull();
    });
});
