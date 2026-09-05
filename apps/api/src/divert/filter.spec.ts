import { describe, expect, it } from 'vitest';
import { filterFor } from './filter.ts';

const watching = { from: 50000, to: 65535 };

describe('filterFor', () =>
{
    /**
     * The one that was wrong for weeks. VS Code talks to Discord over loopback on a
     * high port, which is inside the range watched for calls: it was handed copies
     * it never asked for, and the two stopped finding each other.
     */
    it('leaves alone what never leaves this machine', () =>
    {
        const said = filterFor(watching);

        expect(said).toContain('ip.DstAddr != 127.0.0.1');
        expect(said).toContain('ip.SrcAddr != 127.0.0.1');
    });

    // A packet this program sends comes back through this same filter, and a copy of
    // a copy is what the log filled up with.
    it('refuses its own injections by name', () =>
    {
        expect(filterFor(watching)).toContain('not impostor');
    });

    it('watches nothing coming in', () =>
    {
        expect(filterFor(watching)).toContain('outbound');
    });

    // A hello is the packet with something in it; the one opening the connection
    // carries nothing and has no name to read.
    it('takes only a packet on 443 that carries something', () =>
    {
        const said = filterFor(watching);

        expect(said).toContain('tcp.DstPort == 443');
        expect(said).toContain('tcp.PayloadLength > 0');
    });

    // A call is given a port by the far end and answers from one of its own, and
    // watching the far end alone let every datagram go by unseen.
    it('watches both ends of a call', () =>
    {
        const said = filterFor(watching);

        expect(said).toContain('udp.SrcPort >= 50000');
        expect(said).toContain('udp.DstPort >= 50000');
    });

    it('takes the range it was given rather than one of its own', () =>
    {
        const said = filterFor({ from: 19294, to: 19344 });

        expect(said).toContain('19294');
        expect(said).toContain('19344');
        expect(said).not.toContain('50000');
    });

    // Everything is joined with and: one or in the wrong place and the filter takes
    // the whole machine.
    it('joins its conditions so that all of them must hold', () =>
    {
        const said = filterFor(watching);
        const before = said.slice(0, said.indexOf('('));

        expect(before).not.toContain(' or ');
        expect(before.split(' and ').length).toBeGreaterThan(3);
    });
});
