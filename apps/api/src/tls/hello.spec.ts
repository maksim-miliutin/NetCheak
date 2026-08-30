import { describe, expect, it } from 'vitest';
import { buildHello, length16, length24, nameAt } from './hello.ts';

describe('length16', () =>
{
    it('writes a length across two bytes, biggest first', () =>
    {
        expect([...length16(1)]).toEqual([0, 1]);
        expect([...length16(256)]).toEqual([1, 0]);
        expect([...length16(65535)]).toEqual([255, 255]);
    });
});

describe('length24', () =>
{
    it('writes a length across three bytes, biggest first', () =>
    {
        expect([...length24(1)]).toEqual([0, 0, 1]);
        expect([...length24(65536)]).toEqual([1, 0, 0]);
    });
});

describe('buildHello', () =>
{
    const hello = buildHello('example.com');

    // A record starts with its kind and the version it speaks.
    it('opens as a handshake record', () =>
    {
        expect(hello[0]).toBe(0x16);
        expect([hello[1], hello[2]]).toEqual([0x03, 0x03]);
    });

    it('says how long the rest of the record is, and is that long', () =>
    {
        const said = ((hello[3] ?? 0) << 8) + (hello[4] ?? 0);

        expect(hello.length).toBe(said + 5);
    });

    it('says it is a hello from a client', () =>
    {
        expect(hello[5]).toBe(0x01);
    });

    it('says how long the handshake is, and is that long', () =>
    {
        const said = ((hello[6] ?? 0) << 16) + ((hello[7] ?? 0) << 8) + (hello[8] ?? 0);

        expect(hello.length).toBe(said + 9);
    });

    // The name is the whole point: it is what a filter reads and what a split hides.
    it('carries the name of the wanted site', () =>
    {
        expect(hello.includes(Buffer.from('example.com'))).toBe(true);
    });

    it('carries a different name when asked for one', () =>
    {
        expect(buildHello('other.test').includes(Buffer.from('other.test'))).toBe(true);
    });

    // Two hellos alike would let a server answer the second from a cache.
    it('is different every time', () =>
    {
        expect(buildHello('example.com').equals(buildHello('example.com'))).toBe(false);
    });
});

describe('nameAt', () =>
{
    it('finds where the name sits, so a write can be cut through it', () =>
    {
        const hello = buildHello('example.com');
        const at = nameAt(hello, 'example.com');

        expect(at).toBeGreaterThan(0);
        expect(hello.subarray(at, at + 11).toString()).toBe('example.com');
    });

    it('says nothing when the name is not in there', () =>
    {
        expect(nameAt(buildHello('example.com'), 'absent.test')).toBe(-1);
    });
});
