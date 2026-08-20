import { describe, expect, it } from 'vitest';
import { judge } from './verdict.ts';
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

describe('judge', () =>
{
    it('says nothing before the first check', () =>
    {
        const verdict = judge([target('a', { quality: null })]);

        expect(verdict).toMatchObject({ level: 'unknown', cause: 'never-checked' });
    });

    it('calls the link down when nothing answers at all', () =>
    {
        const verdict = judge([
            target('Cloudflare DNS', { host: '1.1.1.1', loss: 100 }),
            target('GitHub', { host: 'github.com', loss: 100 }),
        ]);

        expect(verdict).toMatchObject({ level: 'down', cause: 'link', reachable: 0 });
    });

    // Addresses answer while names do not: the packets travel, the lookup fails.
    it('blames dns when only the named hosts fail', () =>
    {
        const verdict = judge([
            target('Cloudflare DNS', { host: '1.1.1.1' }),
            target('Google DNS', { host: '8.8.8.8' }),
            target('Yandex', { host: 'ya.ru', loss: 100 }),
            target('GitHub', { host: 'github.com', loss: 100 }),
        ]);

        expect(verdict).toMatchObject({ level: 'down', cause: 'dns' });
        expect(verdict.blame).toEqual(['Yandex', 'GitHub']);
    });

    // One address down among healthy ones says nothing about the local network.
    it('blames the far side when a single address fails', () =>
    {
        const verdict = judge([
            target('Cloudflare DNS', { host: '1.1.1.1' }),
            target('GitHub', { host: 'github.com', loss: 100 }),
            target('Yandex', { host: 'ya.ru' }),
        ]);

        expect(verdict).toMatchObject({ level: 'warn', cause: 'remote', blame: ['GitHub'] });
    });

    it('does not blame dns when an address is among the dead', () =>
    {
        const verdict = judge([
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

    it('stays quiet when everything is healthy', () =>
    {
        const verdict = judge([
            target('Cloudflare DNS', { host: '1.1.1.1' }),
            target('Yandex', { host: 'ya.ru' }),
        ]);

        expect(verdict).toMatchObject({ level: 'ok', cause: 'none', reachable: 2, total: 2 });
    });

    it('counts only targets that were actually checked', () =>
    {
        const verdict = judge([
            target('Cloudflare DNS', { host: '1.1.1.1' }),
            target('Never', { quality: null }),
        ]);

        expect(verdict.total).toBe(1);
    });
});
