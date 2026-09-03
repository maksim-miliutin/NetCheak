import { describe, expect, it } from 'vitest';
import { decide, ours, type Handling } from './handle.ts';

const DECOY = 'www.microsoft.com';

const HOW: Handling =
{
    fooling: 'badsum', ttl: 6, decoyName: DECOY, repeats: 6, hello: null, cut: false,
    only: [], datagram: null, cutoff: 0, helped: null, voicePorts: [19294, 19344],
};

/** A packet carrying a hello that names a site, built so the tests can name it too. */
function build(host: string, first = 0x16, padding = 40): Buffer
{
    const payload = Buffer.concat(
    [
        Buffer.from([first, 0x03, 0x01, 0x00, 0x00]),
        Buffer.alloc(60, 0x11),
        Buffer.from([0x00, 0x00]),
        Buffer.from([0x00, host.length + 5, 0x00, host.length + 3, 0x00, 0x00,
            host.length]),
        Buffer.from(host, 'latin1'),
        Buffer.alloc(padding, 0x22),
    ]);

    const ip = Buffer.alloc(20);

    ip[0] = 0x45;
    ip[8] = 64;
    ip[9] = 6;
    ip.writeUInt16BE(40 + payload.length, 2);
    ip.writeUInt32BE(0xc0a80101, 12);
    ip.writeUInt32BE(0x08080808, 16);

    const tcp = Buffer.alloc(20);

    tcp.writeUInt16BE(50000, 0);
    tcp.writeUInt16BE(443, 2);
    tcp.writeUInt32BE(1000, 4);
    tcp[12] = 5 << 4;

    return Buffer.concat([ip, tcp, payload]);
}

describe('decide', () =>
{
    it('reads the name the hello asks for', () =>
    {
        expect(decide(build('discord.com'), HOW).name).toBe('discord.com');
    });

    it('cuts just past the beginning of the name when cutting is asked for', () =>
    {
        const done = decide(build('discord.com'), { ...HOW, cut: true });

        expect(done.pieces).toHaveLength(2);
        expect(done.at).toBeGreaterThan(0);
    });

    // Fake and cut are two tricks against two filters. The one this was measured
    // against does neither better for having both done to it.
    it('leaves the hello whole when only copies were asked for', () =>
    {
        const done = decide(build('discord.com'), HOW);

        expect(done.pieces).toBeNull();
        expect(done.decoys.length).toBeGreaterThan(0);
    });

    it('sends as many copies as it was asked for', () =>
    {
        expect(decide(build('discord.com'), { ...HOW, repeats: 6 }).decoys).toHaveLength(6);
        expect(decide(build('discord.com'), { ...HOW, repeats: 1 }).decoys).toHaveLength(1);
    });

    it('carries a recorded hello in the copy when it is given one', () =>
    {
        const hello = Buffer.alloc(300, 0x16);
        const done = decide(build('discord.com'), { ...HOW, hello });

        expect(done.decoys[0]?.length).toBe(40 + hello.length);
    });

    it('says how much the hello carried, not how big the packet was', () =>
    {
        const packet = build('discord.com');
        const done = decide(packet, HOW);

        expect(done.bytes).toBe(packet.length - 40);
    });

    it('sends copies ahead when something is asked to fool the filter', () =>
    {
        expect(decide(build('discord.com'), HOW).decoys.length).toBeGreaterThan(0);
    });

    it('sends no copies when only cutting was asked for', () =>
    {
        const done = decide(build('discord.com'), { ...HOW, fooling: 'none', cut: true });

        expect(done.decoys).toHaveLength(0);
        expect(done.pieces).not.toBeNull();
    });

    it('passes the hello along when it was asked to do nothing at all', () =>
    {
        const done = decide(build('discord.com'), { ...HOW, fooling: 'none', cut: false });

        expect(done.outcome).toBe('passed');
    });

    // This is the loop the driver used to make: a copy came back around, was taken
    // for a hello, and was copied again until the log was nothing else.
    it('leaves a copy of its own alone rather than copying it again', () =>
    {
        const done = decide(build(DECOY), HOW);

        expect(done.outcome).toBe('returned');
        expect(done.decoys).toHaveLength(0);
        expect(done.pieces).toBeNull();
    });

    // The recorded hello names whoever was recorded, so the name says nothing about
    // whose packet this is. The bytes do.
    it('knows a copy built from a recorded hello by its contents', () =>
    {
        const packet = build('www.google.com');
        const hello = packet.subarray(40);

        const done = decide(packet, { ...HOW, hello: Buffer.from(hello) });

        expect(done.outcome).toBe('returned');
        expect(done.decoys).toHaveLength(0);
    });

    it('still helps a site whose hello merely resembles the recorded one', () =>
    {
        const hello = build('www.google.com').subarray(40);
        const other = Buffer.concat([hello.subarray(0, hello.length - 1),
            Buffer.from([0x33])]);

        expect(decide(build('discord.com'), { ...HOW, hello: Buffer.from(other) }).outcome)
            .toBe('helped');
    });

    it('knows its own copy when the name it replaced was shorter', () =>
    {
        expect(decide(build('www.microso'), HOW).outcome).toBe('returned');
    });

    it('knows its own copy when the name it replaced was longer', () =>
    {
        expect(decide(build('www.microsoft.comaaaaaaaaa'), HOW).outcome).toBe('returned');
    });

    it('leaves alone a site it was not asked about', () =>
    {
        const done = decide(build('music.yandex.ru'), { ...HOW, only: ['discord'] });

        expect(done.outcome).toBe('passed');
        expect(done.decoys).toHaveLength(0);
    });

    it('helps the site it was asked about, by any part of its name', () =>
    {
        for (const host of ['discord.com', 'gateway.discord.gg', 'media.discordapp.net'])
        {
            expect(decide(build(host), { ...HOW, only: ['discord'] }).outcome)
                .toBe('helped');
        }
    });

    it('helps everything when it was given no names to keep to', () =>
    {
        expect(decide(build('music.yandex.ru'), HOW).outcome).toBe('helped');
    });

    // Somebody else's ordinary hello has to come from somewhere, and taking it out
    // of a real connection beats borrowing a file from another program's folder.
    it('hands back what the hello carried, so a copy can be recorded from it', () =>
    {
        const packet = build('discord.com');
        const done = decide(packet, HOW);

        expect(done.payload?.equals(packet.subarray(40))).toBe(true);
    });

    it('hands it back even when it did nothing to the packet', () =>
    {
        const done = decide(build('music.yandex.ru'), { ...HOW, only: ['discord'] });

        expect(done.outcome).toBe('passed');
        expect(done.payload).not.toBeNull();
    });

    it('passes a packet that is not a handshake', () =>
    {
        expect(decide(build('discord.com', 0x17), HOW).outcome).toBe('passed');
    });

    it('passes a handshake with no name in it', () =>
    {
        const nameless = Buffer.concat([build('a').subarray(0, 40), Buffer.alloc(60, 0x16)]);

        nameless[40] = 0x16;

        expect(decide(nameless, HOW).outcome).toBe('passed');
    });

    it('passes a packet too short to read', () =>
    {
        expect(decide(Buffer.alloc(10), HOW).outcome).toBe('passed');
    });
});

describe('ours', () =>
{
    it.each(['www.microsoft.com', 'www.microso', 'www.microsoft.', 'w',
        'www.microsoft.comaa', 'www.microsoft.comaaaaaaaaa'])('knows %s as its own', (name) =>
    {
        expect(ours(name, DECOY)).toBe(true);
    });

    it.each(['discord.com', 'gateway.discord.gg', 'strm.yandex.ru',
        'lv118.rapidstaticserve.cc', ''])('leaves %s alone', (name) =>
    {
        expect(ours(name, DECOY)).toBe(false);
    });
});

describe('decide, on a datagram', () =>
{
    /** A datagram on the ports that carry voice. */
    function voice(payload = Buffer.alloc(120, 0x80), toPort = 19306): Buffer
    {
        const ip = Buffer.alloc(20);

        ip[0] = 0x45;
        ip[8] = 64;
        ip[9] = 17;
        ip.writeUInt16BE(28 + payload.length, 2);
        ip.writeUInt32BE(0xc0a80101, 12);
        ip.writeUInt32BE(0x08080808, 16);

        const udp = Buffer.alloc(8);

        udp.writeUInt16BE(60000, 0);
        udp.writeUInt16BE(toPort, 2);
        udp.writeUInt16BE(8 + payload.length, 4);

        return Buffer.concat([ip, udp, payload]);
    }

    const RECORDED = Buffer.alloc(200, 0x42);

    it('sends copies ahead of the voice it was given one for', () =>
    {
        const done = decide(voice(), { ...HOW, datagram: RECORDED, repeats: 6 });

        expect(done.outcome).toBe('helped');
        expect(done.decoys).toHaveLength(6);
        expect(done.decoys[0]?.length).toBe(28 + RECORDED.length);
    });

    // Which end holds the high port is not knowable beforehand, so the log carries
    // both: the first log of a call showed neither and the search went the wrong way.
    it('names both ports, there being no name in a datagram to give', () =>
    {
        expect(decide(voice(), { ...HOW, datagram: RECORDED }).name)
            .toBe('udp:60000->19306');
    });

    it('passes it along when nothing was recorded to send ahead', () =>
    {
        expect(decide(voice(), HOW).outcome).toBe('passed');
    });

    // The names to keep to are read out of a hello, and a datagram has none.
    it('does not hold a datagram to a list of names', () =>
    {
        const done = decide(voice(), { ...HOW, datagram: RECORDED, only: ['discord'] });

        expect(done.outcome).toBe('helped');
    });

    it('stops helping a call once the filter has made up its mind', () =>
    {
        const helped = new Map<string, number>();
        const how = { ...HOW, datagram: RECORDED, cutoff: 2, helped };

        expect(decide(voice(), how).outcome).toBe('helped');
        expect(decide(voice(), how).outcome).toBe('helped');
        expect(decide(voice(), how).outcome).toBe('passed');
        expect(decide(voice(), how).outcome).toBe('passed');
    });

    it('counts each call apart from the others', () =>
    {
        const helped = new Map<string, number>();
        const how = { ...HOW, datagram: RECORDED, cutoff: 1, helped };

        expect(decide(voice(undefined, 19306), how).outcome).toBe('helped');
        expect(decide(voice(undefined, 19307), how).outcome).toBe('helped');
        expect(decide(voice(undefined, 19306), how).outcome).toBe('passed');
    });

    it('helps every datagram when no cutoff was set', () =>
    {
        const how = { ...HOW, datagram: RECORDED, helped: new Map<string, number>() };

        expect(decide(voice(), how).outcome).toBe('helped');
        expect(decide(voice(), how).outcome).toBe('helped');
        expect(decide(voice(), how).outcome).toBe('helped');
    });

    // Six copies of a voice packet went to the name servers and to the clock before
    // this: every one of those leaves from a high port too.
    it.each([53, 123, 443])('leaves a datagram to port %i alone', (toPort) =>
    {
        const done = decide(voice(undefined, toPort), { ...HOW, datagram: RECORDED });

        expect(done.outcome).toBe('passed');
        expect(done.decoys).toHaveLength(0);
    });

    it('knows a datagram of its own that came back around', () =>
    {
        const packet = voice(RECORDED);
        const done = decide(packet, { ...HOW, datagram: RECORDED });

        expect(done.outcome).toBe('returned');
        expect(done.decoys).toHaveLength(0);
    });

    it('hands back what a datagram carried', () =>
    {
        const carried = Buffer.alloc(120, 0x80);
        const done = decide(voice(carried), { ...HOW, datagram: RECORDED });

        expect(done.payload?.equals(carried)).toBe(true);
    });

    it('never cuts one in two, whatever it was asked', () =>
    {
        const done = decide(voice(), { ...HOW, datagram: RECORDED, cut: true });

        expect(done.pieces).toBeNull();
    });
});
