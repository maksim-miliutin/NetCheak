import { describe, expect, it } from 'vitest';
import { outbound } from './outbound.ts';
import type { TargetRow } from '../db/checks.repository.ts';

const target = (name: string, host: string, enabled = true): TargetRow =>
    ({ id: name.length, name, host, port: 443, enabled });

describe('outbound', () =>
{
    it('names every target being watched', () =>
    {
        const list = outbound([target('Mine', 'my.example')]);

        expect(list.errands.some((e) => e.where === 'my.example:443')).toBe(true);
    });

    // A retired target is not contacted, so listing it would overstate what happens.
    it('leaves out a target that was retired', () =>
    {
        const list = outbound([target('Gone', 'gone.example', false)]);

        expect(list.errands.some((e) => e.where.startsWith('gone.example'))).toBe(false);
    });

    it('names the resolver the answers are compared against', () =>
    {
        expect(outbound([]).errands.some((e) => e.where === '1.1.1.1')).toBe(true);
    });

    // Taken from the value the speed code uses, so moving that moves this.
    it('names where the speed measurement goes, from the code that goes there', () =>
    {
        expect(outbound([]).errands.some((e) => e.where.includes('cloudflare'))).toBe(true);
    });

    // A list that claims errands the tool is not running misleads as much as one that
    // hides errands it is.
    it('says nothing about the version check while it is off', () =>
    {
        expect(outbound([]).errands.some((e) => e.where.includes('github'))).toBe(false);
    });

    it('names the version check once it is on', () =>
    {
        expect(outbound([], true).errands.some((e) => e.where.includes('github'))).toBe(true);
    });

    it('says the version check is off by default', () =>
    {
        expect(outbound([]).never.join(' ')).toContain('off unless you turn it on');
    });

    // The proxy changes where the browser's traffic goes, which is the largest thing
    // this tool can do to a machine.
    it('says nothing about the proxy while it is stopped', () =>
    {
        expect(outbound([]).errands.some((e) => e.where.startsWith('127.0.0.1'))).toBe(false);
    });

    it('names the proxy and its port once it runs', () =>
    {
        const errand = outbound([], false, 3128).errands.find((e) => e.where === '127.0.0.1:3128');

        expect(errand?.why).toContain('without being read');
    });

    // Looking a name up over HTTPS sends it somewhere, and that somewhere is not the
    // proxy.
    it('says nothing about the encrypted resolvers while they are unused', () =>
    {
        const said = JSON.stringify(outbound([], false, 3128));

        expect(said).not.toContain('cloudflare-dns');
    });

    it('names every encrypted resolver once they are used', () =>
    {
        const said = JSON.stringify(outbound([], false, 3128, true));

        expect(said).toContain('cloudflare-dns.com');
        expect(said).toContain('dns.google');
    });

    it('says which errands wait for a button', () =>
    {
        const list = outbound([target('Mine', 'my.example')]);

        expect(list.errands.find((e) => e.where === '1.1.1.1')?.onDemand).toBe(true);
        expect(list.errands.find((e) => e.where === 'my.example:443')?.onDemand).toBe(false);
    });

    it('gives a reason for every errand', () =>
    {
        const list = outbound([target('Mine', 'my.example')]);

        expect(list.errands.every((e) => e.why.length > 0)).toBe(true);
    });

    // People assume a network tool phones home; saying plainly that it does not is
    // worth as much as the list itself.
    it('says what it never does', () =>
    {
        const said = outbound([]).never.join(' ').toLowerCase();

        expect(said).toContain('location');
        expect(said).toContain('telemetry');
    });

    // The driver puts more packets on the wire than were asked for, and a list that
    // says everything this tool sends has to say that too.
    it('says the driver is putting copies on the wire while it runs', () =>
    {
        const said = outbound([], false, null, false, true);

        expect(said.errands.some((one) => one.why.includes('copies'))).toBe(true);
    });

    it('says nothing about the driver while it is not running', () =>
    {
        const said = outbound([], false, null, false, false);

        expect(said.errands.some((one) => one.why.includes('copies'))).toBe(false);
    });
});
