import { describe, expect, it, vi } from 'vitest';
import { HEADERS, ORDINARY, readPing, searchLargest } from './mtu.ts';

const WINDOWS_TOO_BIG = 'Packet needs to be fragmented but DF set.';

const LINUX_TOO_BIG = 'ping: local error: message too long, mtu=1420';

const WINDOWS_THROUGH = 'Reply from 1.1.1.1: bytes=1472 time=12ms TTL=57';

const LINUX_THROUGH = '1480 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.0 ms';

describe('readPing', () =>
{
    // A packet refused for its size is the answer being looked for.
    it.each([['windows', WINDOWS_TOO_BIG], ['linux', LINUX_TOO_BIG]])(
        'reads the %s refusal as too big', (_name, output) =>
        {
            expect(readPing(output, 1)).toBe('too-big');
        });

    it.each([['windows', WINDOWS_THROUGH], ['linux', LINUX_THROUGH]])(
        'reads the %s reply as through', (_name, output) =>
        {
            expect(readPing(output, 0)).toBe('through');
        });

    // Silence says nothing about size, and treating it as a refusal would put the
    // edge wherever the path happens to stop answering.
    it.each([['100% packet loss'], ['Request timed out.'], ['General failure.']])(
        'reads %s as silence', (output) =>
        {
            expect(readPing(output, 1)).toBe('silent');
        });

    it('reads a non-zero exit with nothing to say as silence', () =>
    {
        expect(readPing('', 1)).toBe('silent');
    });
});

describe('searchLargest', () =>
{
    const upTo = (edge: number) => async (size: number) => size <= edge;

    it('finds the edge exactly', async () =>
    {
        expect(await searchLargest(548, 1472, upTo(1392))).toBe(1392);
    });

    it('takes the top when everything fits', async () =>
    {
        expect(await searchLargest(548, 1472, upTo(9000))).toBe(1472);
    });

    it('takes the bottom when only it fits', async () =>
    {
        expect(await searchLargest(548, 1472, upTo(548))).toBe(548);
    });

    // Walking one size at a time would be a thousand round trips.
    it('halves the range rather than walking it', async () =>
    {
        const fits = vi.fn(upTo(1392));

        await searchLargest(548, 1472, fits);

        expect(fits.mock.calls.length).toBeLessThan(12);
    });

    // Rounded down, a range of two tests the size already known to pass and never
    // moves; the search would not end.
    it('ends on a range of two', async () =>
    {
        expect(await searchLargest(1000, 1001, upTo(1000))).toBe(1000);
        expect(await searchLargest(1000, 1001, upTo(1001))).toBe(1001);
    });
});

describe('the sizes', () =>
{
    it('counts the headers that ride with every payload', () =>
    {
        expect(HEADERS).toBe(28);
        expect(ORDINARY).toBe(1500);
    });
});
