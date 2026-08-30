/**
 * A hello built by hand, because the point is to control how it is written to the
 * wire. Node's own client sends it in one piece, and one piece is exactly what a
 * filter reads.
 */

const HANDSHAKE = 0x16;

const CLIENT_HELLO = 0x01;

const TLS_1_2 = [0x03, 0x03];

// Suites of the older kind, which a server answers with a hello of its own. Asking
// for the newer version instead needs a key exchange offered alongside, and without
// one the answer is a complaint rather than a hello.
const SUITES = [0xc0, 0x2f, 0xc0, 0x30, 0x00, 0x9c, 0x00, 0x35];

export function buildHello(host: string): Buffer
{
    const body = Buffer.concat(
    [
        Buffer.from(TLS_1_2),
        randomBytes(32),
        Buffer.from([0]),
        length16(SUITES.length),
        Buffer.from(SUITES),
        Buffer.from([1, 0]),
        extensions(host),
    ]);

    const handshake = Buffer.concat([Buffer.from([CLIENT_HELLO]), length24(body.length), body]);

    return Buffer.concat(
    [
        Buffer.from([HANDSHAKE, ...TLS_1_2]),
        length16(handshake.length),
        handshake,
    ]);
}

/** The name of the wanted site, which is the thing a filter is reading. */
export function extensions(host: string): Buffer
{
    const name = Buffer.from(host, 'ascii');

    const serverName = Buffer.concat(
    [
        length16(name.length + 3),
        Buffer.from([0]),
        length16(name.length),
        name,
    ]);

    const sni = Buffer.concat([Buffer.from([0, 0]), length16(serverName.length), serverName]);

    // The curve and point format a server of the older kind expects to be offered.
    const groups = Buffer.from([0x00, 0x0a, 0x00, 0x04, 0x00, 0x02, 0x00, 0x17]);
    const points = Buffer.from([0x00, 0x0b, 0x00, 0x02, 0x01, 0x00]);

    const all = Buffer.concat([sni, groups, points]);

    return Buffer.concat([length16(all.length), all]);
}

/** Where the name sits inside the record, so a write can be cut through it. */
export function nameAt(hello: Buffer, host: string): number
{
    return hello.indexOf(Buffer.from(host, 'ascii'));
}

export function length16(value: number): Buffer
{
    return Buffer.from([(value >> 8) & 0xff, value & 0xff]);
}

export function length24(value: number): Buffer
{
    return Buffer.from([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}

function randomBytes(count: number): Buffer
{
    const bytes = Buffer.alloc(count);

    for (let i = 0; i < count; i += 1)
    {
        bytes[i] = Math.floor(Math.random() * 256);
    }

    return bytes;
}
