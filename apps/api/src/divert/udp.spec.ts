import { describe, expect, it } from 'vitest';
import { datagramChecksum, fakedDatagram, readDatagram } from './udp.ts';
import { checksum } from './packet.ts';

/** A datagram built by hand, so every field under test is one this test chose. */
function build(payload: Buffer, toPort = 50001): Buffer
{
    const ip = Buffer.alloc(20);

    ip[0] = 0x45;
    ip[8] = 64;
    ip[9] = 17;
    ip.writeUInt16BE(20 + 8 + payload.length, 2);
    ip.writeUInt32BE(0xc0a80101, 12);
    ip.writeUInt32BE(0x08080808, 16);

    const udp = Buffer.alloc(8);

    udp.writeUInt16BE(60000, 0);
    udp.writeUInt16BE(toPort, 2);
    udp.writeUInt16BE(8 + payload.length, 4);

    return Buffer.concat([ip, udp, payload]);
}

const VOICE = Buffer.alloc(120, 0x80);

describe('readDatagram', () =>
{
    it('finds where the header ends and the contents begin', () =>
    {
        const read = readDatagram(build(VOICE));

        expect(read?.payloadAt).toBe(28);
        expect(read?.payloadLength).toBe(VOICE.length);
    });

    it('reads the ports it was sent between', () =>
    {
        const read = readDatagram(build(VOICE, 50123));

        expect(read?.fromPort).toBe(60000);
        expect(read?.toPort).toBe(50123);
    });

    it('says nothing about a packet carrying something else', () =>
    {
        const notUdp = build(VOICE);

        notUdp[9] = 6;

        expect(readDatagram(notUdp)).toBeNull();
    });

    it('says nothing about a packet too short to hold a header', () =>
    {
        expect(readDatagram(Buffer.alloc(10))).toBeNull();
    });
});

describe('fakedDatagram', () =>
{
    const RECORDED = Buffer.alloc(200, 0x42);

    it('carries the contents it was given rather than the ones it replaced', () =>
    {
        const faked = fakedDatagram(build(VOICE), RECORDED);

        expect(faked?.subarray(28).equals(RECORDED)).toBe(true);
    });

    it('sets both lengths to the packet it became, not the one it came from', () =>
    {
        const faked = fakedDatagram(build(VOICE), RECORDED);

        expect(faked?.readUInt16BE(2)).toBe(28 + RECORDED.length);
        expect(faked?.readUInt16BE(24)).toBe(8 + RECORDED.length);
    });

    it('keeps the ports of the connection it belongs to', () =>
    {
        const faked = fakedDatagram(build(VOICE, 50077), RECORDED);

        expect(faked?.readUInt16BE(22)).toBe(50077);
    });

    it('leaves the address header summed correctly', () =>
    {
        const faked = fakedDatagram(build(VOICE), RECORDED);

        expect(checksum(faked!.subarray(0, 20))).toBe(0);
    });

    it('sums the datagram itself so the far end will look at it', () =>
    {
        const faked = fakedDatagram(build(VOICE), RECORDED);
        const read = readDatagram(faked!);

        expect(datagramChecksum(faked!, read!)).toBe(faked?.readUInt16BE(26));
    });

    it('shortens its life when asked, and leaves it alone when not', () =>
    {
        expect(fakedDatagram(build(VOICE), RECORDED, 5)?.[8]).toBe(5);
        expect(fakedDatagram(build(VOICE), RECORDED)?.[8]).toBe(64);
    });

    it('says nothing when it was given nothing to carry', () =>
    {
        expect(fakedDatagram(build(VOICE), Buffer.alloc(0))).toBeNull();
    });

    it('says nothing about a packet it cannot read', () =>
    {
        expect(fakedDatagram(Buffer.alloc(10), RECORDED)).toBeNull();
    });
});
