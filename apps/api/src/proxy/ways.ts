import { findName } from './split.ts';

export type Way =
    | 'whole'
    | 'name'
    | 'first-byte'
    | 'many'
    | 'tiny'
    | 'records'
    | 'records-three'
    | 'both';

export interface Attempt
{
    way: Way;
    /** What to write, in order, one write each. */
    pieces: Buffer[];
}

export const WAYS: Way[] =
[
    'whole',
    'name',
    'first-byte',
    'many',
    'tiny',
    'records',
    'records-three',
    'both',
];

const RECORD_HEADER = 5;

const PIECES = 4;

const TINY_PIECES = 10;

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

    // Small enough that no piece holds anything a filter can act on, at the cost of
    // a write and a wait for each.
    if (way === 'tiny')
    {
        return { way, pieces: intoPieces(hello, TINY_PIECES) };
    }

    if (way === 'records-three')
    {
        return { way, pieces: intoRecords(hello, findName(hello), 3) };
    }

    // Both at once: the handshake in records of its own, and each record written in
    // pieces. For a filter that reassembles one of those and not the other.
    if (way === 'both')
    {
        const records = intoRecords(hello, findName(hello));

        return { way, pieces: records.flatMap((record) => intoPieces(record, 2)) };
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
export function intoRecords(hello: Buffer, nameAt: number, count = 2): Buffer[]
{
    const body = hello.subarray(RECORD_HEADER);

    if (body.length < count)
    {
        return [hello];
    }

    const through = nameAt === -1
        ? Math.floor(body.length / 2)
        : Math.min(body.length - 1, Math.max(1, nameAt - RECORD_HEADER + 2));

    if (count <= 2)
    {
        return [record(hello, body.subarray(0, through)),
            record(hello, body.subarray(through))];
    }

    // The cut through the name stays where it is; the rest is divided after it, so
    // the name is still split whatever else changes.
    const rest = intoPieces(body.subarray(through), count - 1);

    return [record(hello, body.subarray(0, through)),
        ...rest.map((piece) => record(hello, piece))];
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
