import { describe, expect, it } from 'vitest';
import
{
    addressIn,
    parseHops,
    silenceFrom,
    timesIn,
    type Hop,
} from './traceroute.ts';

const WINDOWS = `
Tracing route to example.com [93.184.216.34]
over a maximum of 15 hops:

  1     1 ms     1 ms     1 ms  192.168.1.1
  2     8 ms     7 ms     9 ms  10.20.0.1
  3     *        *        *     Request timed out.
  4    24 ms    23 ms    24 ms  93.184.216.34

Trace complete.
`;

const UNIX = `
traceroute to example.com (93.184.216.34), 15 hops max, 60 byte packets
 1  192.168.1.1  0.512 ms  0.431 ms  0.402 ms
 2  10.20.0.1  8.114 ms  7.902 ms  9.001 ms
 3  * * *
 4  93.184.216.34  24.1 ms  23.8 ms  24.0 ms
`;

const hop = (number: number, times: (number | null)[]): Hop =>
    ({ number, host: null, address: null, times });

describe('parseHops', () =>
{
    it.each([['windows', WINDOWS], ['unix', UNIX]])('reads every hop from %s', (_name, output) =>
    {
        const hops = parseHops(output);

        expect(hops.map((h) => h.number)).toEqual([1, 2, 3, 4]);
        expect(hops[0]?.address).toBe('192.168.1.1');
        expect(hops[3]?.address).toBe('93.184.216.34');
    });

    it.each([['windows', WINDOWS], ['unix', UNIX]])('marks the silent hop in %s', (_name, output) =>
    {
        const hops = parseHops(output);

        expect(hops[2]?.address).toBeNull();
        expect(hops[2]?.times).toEqual([null, null, null]);
    });

    // The header names the target and carries its address; taking it for a hop would
    // put a phantom first line in every trace.
    it('leaves the header alone', () =>
    {
        expect(parseHops('traceroute to example.com (93.184.216.34), 15 hops max')).toEqual([]);
    });

    it('reads nothing out of nothing', () =>
    {
        expect(parseHops('')).toEqual([]);
    });
});

describe('timesIn', () =>
{
    it('reads a time per probe', () =>
    {
        expect(timesIn('1 ms  2 ms  3 ms')).toEqual([1, 2, 3]);
    });

    it('reads the fractional times the unix utility prints', () =>
    {
        expect(timesIn('0.512 ms  0.431 ms')).toEqual([0.512, 0.431]);
    });

    // Windows prints anything under a millisecond as "<1 ms".
    it('reads a time written as under a millisecond', () =>
    {
        expect(timesIn('<1 ms  <1 ms')).toEqual([1, 1]);
    });

    it('keeps a star in its place among the times', () =>
    {
        expect(timesIn('1 ms  *  3 ms')).toEqual([1, null, 3]);
    });

    it('reads three stars as three lost probes', () =>
    {
        expect(timesIn('* * *')).toEqual([null, null, null]);
    });
});

describe('addressIn', () =>
{
    it('finds an address of the fourth version', () =>
    {
        expect(addressIn('1 ms  1 ms  1 ms  192.168.1.1')).toBe('192.168.1.1');
    });

    it('finds an address of the sixth version', () =>
    {
        expect(addressIn('2001:db8::1  4.2 ms')).toBe('2001:db8::1');
    });

    it('finds nothing where nothing answered', () =>
    {
        expect(addressIn('*  *  *  Request timed out.')).toBeNull();
    });
});

describe('silenceFrom', () =>
{
    // Plenty of routers decline to answer while passing traffic along perfectly well,
    // so one quiet hop in the middle says nothing.
    it('ignores a quiet hop with answers after it', () =>
    {
        expect(silenceFrom([hop(1, [1]), hop(2, [null]), hop(3, [3])])).toBeNull();
    });

    it('names the hop where the answers stop for good', () =>
    {
        expect(silenceFrom([hop(1, [1]), hop(2, [null]), hop(3, [null])])).toBe(2);
    });

    it('says nothing when the path answers all the way', () =>
    {
        expect(silenceFrom([hop(1, [1]), hop(2, [2])])).toBeNull();
    });

    it('says nothing about a trace that never started', () =>
    {
        expect(silenceFrom([])).toBeNull();
    });
});
