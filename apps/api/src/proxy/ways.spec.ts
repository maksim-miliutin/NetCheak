import { describe, expect, it } from 'vitest';
import { buildHello } from '../tls/hello.ts';
import { intoPieces, intoRecords, WAYS, writeAs } from './ways.ts';

const hello = buildHello('example.com');

const joined = (pieces: Buffer[]): Buffer => Buffer.concat(pieces);

describe('writeAs', () =>
{
    // Whatever the way, the server must receive the same handshake it would have.
    it.each(WAYS)('leaves the meaning of the hello alone: %s', (way) =>
    {
        const { pieces } = writeAs(way, hello);

        // Anything reframed into records of its own carries their headers too, so
        // the bytes differ by design rather than by mistake.
        if (way === 'records' || way === 'records-three' || way === 'both')
        {
            expect(joined(pieces).length).toBeGreaterThan(hello.length);

            return;
        }

        expect(joined(pieces).equals(hello)).toBe(true);
    });

    it('sends it whole when asked to', () =>
    {
        expect(writeAs('whole', hello).pieces).toHaveLength(1);
    });

    // Some filters read only the packet a connection opens with.
    it('can open with a single byte', () =>
    {
        const { pieces } = writeAs('first-byte', hello);

        expect(pieces[0]).toHaveLength(1);
        expect(pieces).toHaveLength(2);
    });

    // Cutting through the name is what hides it. These three do that.
    it.each(['name', 'many', 'tiny', 'records', 'records-three', 'both'] as const)(
        'leaves the name in no single piece: %s', (way) =>
        {
            const wanted = Buffer.from('example.com');

            expect(writeAs(way, hello).pieces.some((p) => p.includes(wanted))).toBe(false);
        });

    // This one does not, and must not be described as though it did: it defeats a
    // filter that reads only the packet a connection opens with, and nothing more.
    it('leaves the name whole when only the first byte is split off', () =>
    {
        const { pieces } = writeAs('first-byte', hello);

        expect(pieces[1]?.includes(Buffer.from('example.com'))).toBe(true);
    });

    it('cuts into several pieces when asked for many', () =>
    {
        expect(writeAs('many', hello).pieces.length).toBeGreaterThan(2);
    });

    // Each step down costs a write and a wait, so they had better differ.
    it('cuts finer for tiny than for many', () =>
    {
        expect(writeAs('tiny', hello).pieces.length)
            .toBeGreaterThan(writeAs('many', hello).pieces.length);
    });

    it('makes three records when asked for three', () =>
    {
        expect(writeAs('records-three', hello).pieces).toHaveLength(3);
    });

    // Both at once: records of their own, each written in pieces.
    it('cuts the records up as well when asked for both', () =>
    {
        expect(writeAs('both', hello).pieces.length)
            .toBeGreaterThan(writeAs('records', hello).pieces.length);
    });
});

describe('intoPieces', () =>
{
    it('cuts into about as many as asked for', () =>
    {
        expect(intoPieces(Buffer.alloc(100), 4)).toHaveLength(4);
    });

    it('loses nothing', () =>
    {
        const source = Buffer.from('abcdefghij');

        expect(joined(intoPieces(source, 3)).equals(source)).toBe(true);
    });

    it('copes with more pieces asked for than bytes to give', () =>
    {
        expect(joined(intoPieces(Buffer.from('ab'), 9)).toString()).toBe('ab');
    });
});

describe('intoRecords', () =>
{
    const records = intoRecords(hello, hello.indexOf(Buffer.from('example.com')));

    // Each piece is a record of its own, which the protocol allows and a server
    // reassembles, while a filter expecting one record sees only the first.
    it('gives every piece a header of its own', () =>
    {
        for (const record of records)
        {
            expect(record[0]).toBe(hello[0]);
            expect(record[1]).toBe(hello[1]);
            expect(record[2]).toBe(hello[2]);
        }
    });

    it('says in each header how long that piece is', () =>
    {
        for (const record of records)
        {
            const said = ((record[3] ?? 0) << 8) + (record[4] ?? 0);

            expect(record.length).toBe(said + 5);
        }
    });

    it('carries the whole handshake between them', () =>
    {
        const body = Buffer.concat(records.map((r) => r.subarray(5)));

        expect(body.equals(hello.subarray(5))).toBe(true);
    });

    it('leaves something too short alone', () =>
    {
        expect(intoRecords(Buffer.from([0x16, 3, 3, 0, 1, 9]), -1)).toHaveLength(1);
    });

    it('cuts down the middle when there is no name to cut through', () =>
    {
        expect(intoRecords(hello, -1)).toHaveLength(2);
    });
});
