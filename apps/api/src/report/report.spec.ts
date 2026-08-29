import { describe, expect, it } from 'vitest';
import { report, type Sheet } from './report.ts';

const AT = new Date('2026-08-27T18:00:00Z');

function target(name: string, over: Partial<Sheet['targets'][number]> = {})
{
    return {
        targetId: name.length,
        name,
        host: 'example.test',
        port: 443,
        lossPercent: 0,
        averageMs: 12.4,
        jitterMs: 1.1,
        quality: 'good',
        checkedAt: '2026-08-27 18:00',
        samples: [],
        ...over,
    };
}

function sheet(over: Partial<Sheet> = {}): Sheet
{
    return {
        verdict: { level: 'ok', cause: 'none', reachable: 1, total: 1, blame: [] },
        targets: [target('Cloudflare DNS', { host: '1.1.1.1' })],
        history: [],
        oldestMs: null,
        neighbours: null,
        sixth: null,
        paths: [],
        rings: null,
        dns: null,
        tls: [],
        ...over,
    };
}

describe('report', () =>
{
    it('opens with what it is and when it was taken', () =>
    {
        const text = report(sheet(), AT);

        expect(text).toContain('netcheck report');
        expect(text).toContain('2026-08-27T18:00:00.000Z');
    });

    // The person reading it at the provider did not run the tool and will not.
    it('says the verdict in words rather than a code', () =>
    {
        const verdict =
            { level: 'down', cause: 'provider', reachable: 0, total: 4, blame: ['GitHub'] };
        const text = report(sheet({ verdict: verdict as Sheet['verdict'] }), AT);

        expect(text).toContain('The gateway answers, nothing past it does');
        expect(text).not.toContain('provider\n');
        expect(text).toContain('Concerning: GitHub');
    });

    it('leaves out the blame line when there is nobody to blame', () =>
    {
        expect(report(sheet(), AT)).not.toContain('Concerning');
    });

    it('lists every target with its numbers', () =>
    {
        const text = report(sheet(), AT);

        expect(text).toContain('Cloudflare DNS (1.1.1.1:443)');
        expect(text).toContain('loss 0%');
        expect(text).toContain('average 12.4 ms');
    });

    it('writes a dash where a target answered nothing', () =>
    {
        const dead = target('Blocked', { lossPercent: 100, averageMs: null, jitterMs: null });
        const text = report(sheet({ targets: [dead] }), AT);

        expect(text).toContain('loss 100%  average —  jitter —');
    });

    // A line that drops now and then is the case a provider argues about most.
    it('counts the checks that lost packets', () =>
    {
        const history = [{ targetId: 14, name: 'Cloudflare DNS', lossyRuns: 3, runs:
            Array.from({ length: 12 },
                () => ({ checkedAt: 'x', lossPercent: 0, averageMs: 10 })) }];

        expect(report(sheet({ history }), AT)).toContain('3 of the last 12 checks lost packets');
    });

    it('says nothing about history when there is only one check', () =>
    {
        const history = [{ targetId: 14, name: 'Cloudflare DNS', lossyRuns: 0,
            runs: [{ checkedAt: 'x', lossPercent: 0, averageMs: 10 }] }];

        expect(report(sheet({ history }), AT)).not.toContain('of the last');
    });

    it('names the gateway and what it said', () =>
    {
        const rings = {
            gateway: { host: '192.168.1.1', port: 80, answer: 'refused' as const, latencyMs: 2 },
            resolvers: [],
        };

        expect(report(sheet({ rings }), AT)).toContain('Gateway 192.168.1.1: refused');
    });

    it('leaves the gateway out when it was never found', () =>
    {
        const rings = { gateway: null, resolvers: [] };

        expect(report(sheet({ rings }), AT)).not.toContain('Gateway');
    });

    it('sets the two resolvers side by side', () =>
    {
        const dns = {
            name: 'example.com',
            system: { server: '192.168.1.1', addresses: ['10.0.0.1'], ms: 8, error: null },
            reference: { server: '1.1.1.1', addresses: ['93.184.216.34'], ms: 20, error: null },
            agreement: 'sinkholed' as const,
        };

        const text = report(sheet({ dns }), AT);

        expect(text).toContain('192.168.1.1 said 10.0.0.1');
        expect(text).toContain('1.1.1.1 said 93.184.216.34');
    });

    it('says plainly when a resolver answered nothing', () =>
    {
        const dns = {
            name: 'example.com',
            system: { server: '192.168.1.1', addresses: [], ms: null, error: 'ETIMEOUT' },
            reference: { server: '1.1.1.1', addresses: ['93.184.216.34'], ms: 20, error: null },
            agreement: 'system-fails' as const,
        };

        expect(report(sheet({ dns }), AT)).toContain('192.168.1.1 said no answer');
    });

    it('names who signed each certificate', () =>
    {
        const tls = [{
            host: 'github.com',
            port: 443,
            handshake: 'completed' as const,
            ms: 20,
            certificate: { issuer: 'Sectigo', subject: 'github.com', names: [],
                validTo: 'Feb 14 2027', matchesHost: true },
            error: null,
        }];

        expect(report(sheet({ tls }), AT)).toContain('github.com: completed, signed by Sectigo');
    });

    it('says what happened when there was no certificate to read', () =>
    {
        const tls = [{ host: 'ya.ru', port: 443, handshake: 'reset' as const, ms: null,
            certificate: null, error: 'ECONNRESET' }];

        expect(report(sheet({ tls }), AT)).toContain('ya.ru: reset, ECONNRESET');
    });

    // The two findings a provider argues with most.
    it('names a sixth version that leads nowhere', () =>
    {
        const sixth = { state: 'broken' as const, addresses: ['2a02::1'],
            answer: 'silent' as const, ms: null };

        expect(report(sheet({ sixth }), AT)).toContain('leads nowhere');
    });

    it('leaves the sixth version out when there is none to speak of', () =>
    {
        const sixth = { state: 'absent' as const, addresses: [], answer: null, ms: null };

        expect(report(sheet({ sixth }), AT)).not.toContain('IPv6');
    });

    it('writes the packet size only where it falls short', () =>
    {
        const paths =
        [
            { host: 'short.example', mtu: 1392, ordinary: 1500, error: null },
            { host: 'fine.example', mtu: 1500, ordinary: 1500, error: null },
        ];

        const text = report(sheet({ paths }), AT);

        expect(text).toContain('short.example: 1392 bytes cross whole');
        expect(text).not.toContain('fine.example');
    });

    it('leaves the packet size out when nothing was measured', () =>
    {
        expect(report(sheet(), AT)).not.toContain('Packet size');
    });

    // A report can describe more than one minute, and saying so is the difference
    // between a measurement and an impression.
    it('owns up when some of it is old', () =>
    {
        expect(report(sheet({ oldestMs: 300_000 }), AT)).toContain('5 minutes old');
    });

    it('says nothing about age when everything is fresh', () =>
    {
        expect(report(sheet({ oldestMs: 20_000 }), AT)).not.toContain('minutes old');
    });

    it('says nothing about age when nothing was measured', () =>
    {
        expect(report(sheet(), AT)).not.toContain('minutes old');
    });

    it('counts the devices without naming them', () =>
    {
        expect(report(sheet({ neighbours: 7 }), AT)).toContain('Devices seen on this network: 7');
    });

    // Hardware addresses name particular devices, and this text goes to a stranger.
    it('never writes a hardware address', () =>
    {
        expect(report(sheet({ neighbours: 7 }), AT)).not.toMatch(/([0-9a-f]{2}:){5}/i);
    });

    it('leaves the count out when nobody looked', () =>
    {
        expect(report(sheet(), AT)).not.toContain('Devices seen');
    });

    // Somebody pasting this into a ticket deserves to know what they are handing over.
    it('ends by saying what it holds', () =>
    {
        const text = report(sheet(), AT);

        expect(text).toContain('host names, timings and verdicts');
        expect(text).toContain('nothing');
    });
});
