import { describe, expect, it } from 'vitest';
import { judge } from './verdict.ts';
import type { Rings } from '../route/rings.ts';
import type { Agreement, DnsCheck } from '../dns/resolve.ts';
import type { Handshake, TlsCheck } from '../tls/handshake.ts';
import type { StatusRow } from '../db/checks.repository.ts';

interface Options
{
    host?: string;
    loss?: number | null;
    jitter?: number | null;
    quality?: string | null;
}

function target(name: string, options: Options = {}): StatusRow
{
    const loss = options.loss ?? 0;

    return {
        targetId: name.length,
        name,
        host: options.host ?? '203.0.113.1',
        port: 443,
        lossPercent: loss,
        averageMs: loss >= 100 ? null : 20,
        jitterMs: options.jitter ?? 2,
        quality: options.quality === undefined ? 'good' : options.quality,
        checkedAt: '2026-08-19 21:00',
        samples: [],
    };
}

function dnsSaying(agreement: Agreement): DnsCheck
{
    return {
        name: 'example.com',
        system: { server: '192.168.1.1', addresses: ['93.184.216.34'], ms: 9, error: null },
        reference: { server: '1.1.1.1', addresses: ['93.184.216.34'], ms: 20, error: null },
        agreement,
    };
}

function tlsSaying(host: string, handshake: Handshake): TlsCheck
{
    return {
        host,
        port: 443,
        handshake,
        ms: handshake === 'completed' ? 20 : null,
        certificate: null,
        error: handshake === 'completed' ? null : 'ECONNRESET',
    };
}

const healthy =
[
    target('Cloudflare DNS', { host: '1.1.1.1' }),
    target('GitHub', { host: 'github.com' }),
];

const namesDead =
[
    target('Cloudflare DNS', { host: '1.1.1.1' }),
    target('Yandex', { host: 'ya.ru', loss: 100 }),
    target('GitHub', { host: 'github.com', loss: 100 }),
];

describe('judge', () =>
{
    it('says nothing before the first check', () =>
    {
        const verdict = judge([target('a', { quality: null })]);

        expect(verdict).toMatchObject({ level: 'unknown', cause: 'never-checked' });
    });

    it('calls the link down when nothing answers at all', () =>
    {
        const verdict = judge(
        [
            target('Cloudflare DNS', { host: '1.1.1.1', loss: 100 }),
            target('GitHub', { host: 'github.com', loss: 100 }),
        ]);

        expect(verdict).toMatchObject({ level: 'down', cause: 'link', reachable: 0 });
    });

    // Addresses answer while names do not: the packets travel, the lookup fails.
    // Without a look at the nearest hop there is nothing to choose between a dead
    // router and a dead provider, so neither is claimed.
    it('says only that the link is down when the gateway is unknown', () =>
    {
        const dead = [target('Cloudflare DNS', { host: '1.1.1.1', loss: 100 })];

        expect(judge(dead).cause).toBe('link');
        expect(judge(dead, { gateway: null, resolvers: [] }).cause).toBe('link');
    });

    it('blames the router when the gateway itself is silent', () =>
    {
        const rings: Rings =
        {
            gateway: { host: '192.168.1.1', port: 443, answer: 'silent', latencyMs: null },
            resolvers: [],
        };

        const verdict = judge([target('Cloudflare DNS', { host: '1.1.1.1', loss: 100 })], rings);

        expect(verdict.cause).toBe('router');
    });

    // A refused connection is an answer: the router is there, so the fault is past it.
    it('blames the provider when the gateway answers but nothing beyond does', () =>
    {
        const rings: Rings =
        {
            gateway: { host: '192.168.1.1', port: 80, answer: 'refused', latencyMs: 1 },
            resolvers: [],
        };

        const verdict = judge([target('Cloudflare DNS', { host: '1.1.1.1', loss: 100 })], rings);

        expect(verdict.cause).toBe('provider');
    });

    it('blames dns when only the named hosts fail', () =>
    {
        const verdict = judge(
        [
            target('Cloudflare DNS', { host: '1.1.1.1' }),
            target('Google DNS', { host: '8.8.8.8' }),
            target('Yandex', { host: 'ya.ru', loss: 100 }),
            target('GitHub', { host: 'github.com', loss: 100 }),
        ]);

        expect(verdict).toMatchObject({ level: 'down', cause: 'dns' });
        expect(verdict.blame).toEqual(['Yandex', 'GitHub']);
    });

    // One address down among healthy ones says nothing about the local network.
    // The pattern alone cannot tell a broken lookup from a blocked road to a name that
    // resolves perfectly well.
    it('keeps to the plain dns answer when no resolver was asked', () =>
    {
        expect(judge(namesDead).cause).toBe('dns');
    });

    it('confirms the resolver when it is the one failing', () =>
    {
        expect(judge(namesDead, undefined, dnsSaying('system-fails')).cause).toBe('dns');
    });

    it('calls out an answer pointing nowhere', () =>
    {
        expect(judge(namesDead, undefined, dnsSaying('sinkholed')).cause).toBe('sinkholed');
    });

    // Resolution works and the connections still fail: the name is found, the road to
    // it is not, and telling the user to change DNS would waste their evening.
    it('stops blaming dns when the lookup plainly works', () =>
    {
        expect(judge(namesDead, undefined, dnsSaying('agree')).cause).toBe('filtered');
        expect(judge(namesDead, undefined, dnsSaying('differ')).cause).toBe('filtered');
    });

    it('blames the far side when a single address fails', () =>
    {
        const verdict = judge(
        [
            target('Cloudflare DNS', { host: '1.1.1.1' }),
            target('GitHub', { host: 'github.com', loss: 100 }),
            target('Yandex', { host: 'ya.ru' }),
        ]);

        expect(verdict).toMatchObject({ level: 'warn', cause: 'remote', blame: ['GitHub'] });
    });

    it('does not blame dns when an address is among the dead', () =>
    {
        const verdict = judge(
        [
            target('Cloudflare DNS', { host: '1.1.1.1', loss: 100 }),
            target('GitHub', { host: 'github.com', loss: 100 }),
            target('Yandex', { host: 'ya.ru' }),
        ]);

        expect(verdict.cause).toBe('remote');
    });

    it('reports an unstable link on heavy loss', () =>
    {
        const verdict = judge([target('Cloudflare DNS', { host: '1.1.1.1', loss: 40 })]);

        expect(verdict).toMatchObject({ level: 'warn', cause: 'unstable' });
    });

    it('reports an unstable link on wild jitter', () =>
    {
        const verdict = judge([target('Cloudflare DNS', { host: '1.1.1.1', jitter: 90 })]);

        expect(verdict).toMatchObject({ level: 'warn', cause: 'unstable' });
    });

    // A filter reading the requested name lets the connection open and cuts it during
    // the handshake, so the probe sees no loss at all.
    it('notices a handshake cut even when nothing was lost', () =>
    {
        const verdict = judge(healthy, undefined, undefined, [tlsSaying('github.com', 'reset')]);

        expect(verdict).toMatchObject({ level: 'warn', cause: 'handshake-cut' });
        expect(verdict.blame).toEqual(['github.com']);
    });

    it('stays quiet when the handshakes all complete', () =>
    {
        const checks = [tlsSaying('github.com', 'completed')];

        expect(judge(healthy, undefined, undefined, checks).cause).toBe('none');
    });

    it('stays quiet when the certificates were never checked', () =>
    {
        expect(judge(healthy).cause).toBe('none');
    });

    it('stays quiet when everything is healthy', () =>
    {
        const verdict = judge(
        [
            target('Cloudflare DNS', { host: '1.1.1.1' }),
            target('Yandex', { host: 'ya.ru' }),
        ]);

        expect(verdict).toMatchObject({ level: 'ok', cause: 'none', reachable: 2, total: 2 });
    });

    it('counts only targets that were actually checked', () =>
    {
        const verdict = judge(
        [
            target('Cloudflare DNS', { host: '1.1.1.1' }),
            target('Never', { quality: null }),
        ]);

        expect(verdict.total).toBe(1);
    });
});
