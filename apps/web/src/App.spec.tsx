import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

/**
 * The page itself, drawn and pressed. Everything under it is checked without a
 * document — what a verdict means, where a packet is cut — and the page was still the
 * one place a fault showed up as a blank screen rather than a failing test.
 */

const VERDICT = { level: 'warn', cause: 'unstable', reachable: 1, total: 2,
    blame: ['Far server'] };

const TARGET =
{
    targetId: 1,
    name: 'Far server',
    host: 'far.example',
    port: 443,
    lossPercent: 40,
    averageMs: 288,
    jitterMs: 44,
    quality: 'poor',
    checkedAt: '2026-08-30 12:00',
    samples: [{ reachable: true, latencyMs: 288 }],
};

const ANSWERS: Record<string, unknown> =
{
    '/api/status': { verdict: VERDICT, targets: [TARGET], speed: null, rings: null },
    '/api/history': { targets: [] },
    '/api/tunnels': { adapters: [], tunnelling: [] },
    '/api/neighbours': { neighbours: [], error: null },
    '/api/proxy': { running: false, relays: [], ways: [], overHttps: false,
        preset: null, presets: [], system: false, systemError: null,
        onNetwork: false, lan: null },
    '/api/checks': { checkId: 1 },
    '/api/sixth': { state: 'absent', addresses: [], answer: null, ms: null },
    '/api/dns': { name: 'example.com', system: null,
        reference: { server: '1.1.1.1', addresses: [], ms: 4, error: null },
        agreement: 'unknown' },
    '/api/tls': { checks: [], verdict: VERDICT },
    '/api/mtu': { host: 'far.example', mtu: 1392, ordinary: 1500, error: null },
};

/** Answers whatever the page asks, with anything the test wants changed on top. */
function answering(over: Record<string, unknown> = {}): ReturnType<typeof vi.fn>
{
    const bodies = { ...ANSWERS, ...over };

    return vi.fn(async (input: string) =>
    {
        const path = Object.keys(bodies).find((one) => String(input).includes(one));
        const body = path === undefined ? {} : bodies[path];

        if (body === 'fails')
        {
            return { ok: false, status: 500, json: async () => ({}) } as Response;
        }

        return { ok: true, status: 200, json: async () => body,
            text: async () => JSON.stringify(body) } as Response;
    });
}

afterEach(() =>
{
    cleanup();
    vi.restoreAllMocks();
});

describe('the page', () =>
{
    it('says what broke, in words, once it has loaded', async () =>
    {
        vi.stubGlobal('fetch', answering());

        render(<App />);

        expect(await screen.findByText(/unsteady|нестабильна/i)).toBeTruthy();
    });

    // The one thing somebody presses when a page will not open.
    it('walks the whole chain from one press', async () =>
    {
        const fetcher = answering();

        vi.stubGlobal('fetch', fetcher);
        render(<App />);

        await screen.findByText(/unsteady|нестабильна/i);

        await userEvent.click(await screen.findByRole('button', { name: /run the checks/i }));

        await waitFor(() =>
        {
            const asked = fetcher.mock.calls.map((call) => String(call[0]));

            for (const path of ['/api/checks', '/api/sixth', '/api/dns', '/api/tls'])
            {
                expect(asked.some((one) => one.includes(path)), path).toBe(true);
            }
        });
    });

    /**
     * An answer that arrives without a verdict once left the page blank, which is a
     * worse diagnosis than a stale sentence and happens exactly when the network is
     * misbehaving.
     */
    it('keeps the old headline when an answer arrives short', async () =>
    {
        vi.stubGlobal('fetch', answering({ '/api/tls': { checks: [] } }));

        render(<App />);

        await screen.findByText(/unsteady|нестабильна/i);
        await userEvent.click(screen.getByRole('button', { name: /run the checks/i }));

        await waitFor(() =>
        {
            expect(screen.getByText(/unsteady|нестабильна/i)).toBeTruthy();
        });
    });

    it('shows the trouble rather than swallowing it when a call fails', async () =>
    {
        vi.stubGlobal('fetch', answering({ '/api/checks': 'fails' }));

        render(<App />);

        await screen.findByText(/unsteady|нестабильна/i);
        await userEvent.click(screen.getByRole('button', { name: /run the checks/i }));

        expect(await screen.findByText(/500/)).toBeTruthy();
    });

    // A target left marked as running has a button disabled until the page reloads.
    it('lets a failed lookup be tried again', async () =>
    {
        vi.stubGlobal('fetch', answering({ '/api/mtu': 'fails' }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        const button = await screen.findByRole('button', { name: /packet size|размер пакета/i });

        await userEvent.click(button);

        await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    });

    it('draws a lane for every target it was given', async () =>
    {
        vi.stubGlobal('fetch', answering());

        render(<App />);

        expect(await screen.findByText('far.example')).toBeTruthy();
        expect(screen.getByText(/288/)).toBeTruthy();
    });

    // Nothing measured is not the same as measured as none.
    it('writes a dash where a target answered nothing', async () =>
    {
        const empty = { ...TARGET, lossPercent: 100, averageMs: null, jitterMs: null };

        vi.stubGlobal('fetch', answering({
            '/api/status': { verdict: VERDICT, targets: [empty], speed: null, rings: null },
        }));

        render(<App />);

        await screen.findByText('far.example');
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('switches language without losing what is on screen', async () =>
    {
        vi.stubGlobal('fetch', answering());

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        const toggle = screen.getByRole('button', { name: /^(EN|RU)$/ });
        const before = toggle.textContent;

        await userEvent.click(toggle);

        await waitFor(() => expect(toggle.textContent).not.toBe(before));
        expect(screen.getByText('far.example')).toBeTruthy();
    });
});
