import { findName } from './split.ts';

export type Way = 'whole' | 'name' | 'first-byte' | 'many' | 'records';

export interface Attempt
{
    way: Way;
    /** What to write, in order, one write each. */
    pieces: Buffer[];
}

export const WAYS: Way[] = ['whole', 'name', 'first-byte', 'many', 'records'];

const RECORD_HEADER = 5;

const PIECES = 4;

/**
 * The same hello written five ways. A filter reads the wanted name out of what
 * arrives; each of these leaves it unreadable differently, and which one works
 * depends on how the filter was built.
 */
export function writeAs(way: Way, hello: Buffer): Attempt
{
    if (way === 'whole')
    {
        return { way, pieces: [hello] };
    }

    if (way === 'first-byte')
    {
        // Some read only the packet a connection opens with, and one byte is not it.
        return { way, pieces: [hello.subarray(0, 1), hello.subarray(1)] };
    }

    if (way === 'name')
    {
        const at = findName(hello);
        const cut = at === -1 ? Math.floor(hello.length / 2) : at + 2;

        return { way, pieces: [hello.subarray(0, cut), hello.subarray(cut)] };
    }

    if (way === 'many')
    {
        return { way, pieces: intoPieces(hello, PIECES) };
    }

    return { way, pieces: intoRecords(hello, findName(hello)) };
}

/** Even pieces of the write, so no one of them holds much of anything. */
export function intoPieces(hello: Buffer, count: number): Buffer[]
{
    const size = Math.max(1, Math.ceil(hello.length / count));
    const pieces: Buffer[] = [];

    for (let at = 0; at < hello.length; at += size)
    {
        pieces.push(hello.subarray(at, Math.min(at + size, hello.length)));
    }

    return pieces;
}

/**
 * The handshake split across two records of its own rather than across writes. The
 * protocol allows this and a server puts the pieces back together, while a filter
 * that expects one record per handshake sees only the first. The cut goes through the
 * name for the same reason it does everywhere else: cutting elsewhere leaves the name
 * whole inside one of the records, which is the thing being hidden.
 */
export function intoRecords(hello: Buffer, nameAt: number): Buffer[]
{
    const body = hello.subarray(RECORD_HEADER);

    if (body.length < 2)
    {
        return [hello];
    }

    const through = nameAt === -1
        ? Math.floor(body.length / 2)
        : Math.min(body.length - 1, Math.max(1, nameAt - RECORD_HEADER + 2));

    return [record(hello, body.subarray(0, through)), record(hello, body.subarray(through))];
}

function record(hello: Buffer, piece: Buffer): Buffer
{
    return Buffer.concat(
    [
        Buffer.from([hello[0] ?? 0x16]),
        hello.subarray(1, 3),
        Buffer.from([(piece.length >> 8) & 0xff, piece.length & 0xff]),
        piece,
    ]);
}
