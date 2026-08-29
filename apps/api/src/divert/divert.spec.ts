import { describe, expect, it } from 'vitest';
import { buildHello } from '../tls/hello.ts';
import { canDivert, cutAt, pieces, reasonFor } from './divert.ts';

function packet(payload: Buffer): Buffer
{
    const ip = Buffer.alloc(20);

    ip[0] = 0x45;
    ip[9] = 6;
    ip.writeUInt16BE(40 + payload.length, 2);

    const tcp = Buffer.alloc(20);

    tcp.writeUInt32BE(500, 4);
    tcp[12] = 5 << 4;

    return Buffer.concat([ip, tcp, payload]);
}

describe('canDivert', () =>
{
    it('is a windows path and says so elsewhere', () =>
    {
        expect(canDivert('win32')).toBe(true);
        expect(canDivert('linux')).toBe(false);
        expect(canDivert('darwin')).toBe(false);
    });
});

describe('reasonFor', () =>
{
    // Somebody who wanted their internet fixed should not have to read a stack trace.
    it('says plainly that this path is windows only', () =>
    {
        expect(reasonFor(new Error(''), 'linux')).toContain('Windows-only');
    });

    it('names the rights the driver needs', () =>
    {
        expect(reasonFor(new Error('Access is denied'), 'win32')).toContain('administrator');
    });

    it('says what to download when the library is missing', () =>
    {
        expect(reasonFor(new Error('cannot open shared object'), 'win32'))
            .toContain('WinDivert.dll');
    });

    it('passes anything else along as it came', () =>
    {
        expect(reasonFor(new Error('something else'), 'win32')).toBe('something else');
    });
});

describe('cutAt', () =>
{
    it('cuts through the name, as everywhere else in this tool', () =>
    {
        const hello = buildHello('example.com');
        const at = cutAt(hello);
        const name = hello.indexOf(Buffer.from('example.com'));

        expect(at).toBeGreaterThan(name);
        expect(at).toBeLessThan(name + 11);
    });

    // Everything that is not a handshake goes through untouched.
    it('leaves anything that is not a hello alone', () =>
    {
        expect(cutAt(Buffer.from('GET / HTTP/1.1\r\n\r\n'))).toBeNull();
        expect(cutAt(Buffer.alloc(2))).toBeNull();
    });
});

describe('pieces', () =>
{
    it('cuts a captured hello into two packets', () =>
    {
        const cut = pieces(packet(buildHello('example.com')), 40);

        expect(cut).toHaveLength(2);
    });

    // Neither packet may carry the name a filter is looking for.
    it('leaves the name in neither packet', () =>
    {
        const cut = pieces(packet(buildHello('example.com')), 40);
        const wanted = Buffer.from('example.com');

        expect(cut?.some((one) => one.includes(wanted))).toBe(false);
    });

    it('leaves anything that is not a hello to go as it came', () =>
    {
        expect(pieces(packet(Buffer.from('GET / HTTP/1.1')), 40)).toBeNull();
    });
});
