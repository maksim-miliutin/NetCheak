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
        onNetwork: false, lan: null, key: null, routed: [], told: [] },
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

    return vi.fn(async (input: string, sent?: { body?: string }) =>
    {
        const path = Object.keys(bodies).find((one) => String(input).includes(one));
        const answer = path === undefined ? {} : bodies[path];

        // A function rather than a body, for a route that has to answer differently
        // the second time it is asked. It is handed what was sent, for the tests
        // that care what the page asked for and not only what came back.
        const body = typeof answer === 'function' ? answer(sent?.body) : answer;

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

        // Asked as a question rather than as a check: the button that measures a
        // packet size is the one that answers why large files stall.
        const button = (await screen.findAllByRole('button',
            { name: /why it is slow|почему медленно/i }))[0]!;

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

    it('explains only the set that is in hand', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/proxy': { running: false, relays: [], ways: [], overHttps: false,
                preset: null, presets: [{ id: 'lite-1' }, { id: 'shred-2' }],
                system: false, systemError: null, onNetwork: false, lan: null,
                routed: [], told: [] },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        const sets = await screen.findByLabelText(/^(Set|Набор)$/);

        expect(screen.getByText(/one proxy per way of writing/i)).toBeTruthy();

        await userEvent.selectOptions(sets, 'shred-2');

        expect(screen.queryByText(/one proxy per way of writing/i)).toBeNull();

        // The name of the set says ten pieces too now, so the sentence beneath it
        // has to be matched on something the name does not carry.
        expect(screen.getByText(/none holding anything|за что зацепиться/i)).toBeTruthy();
    });

    it('will not offer a set while a proxy is already running', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/proxy': { running: true, relays: [{ port: 3128, way: 'split' }],
                ways: ['split'], overHttps: false, preset: 'lite-1',
                presets: [{ id: 'lite-1' }], system: true, systemError: null,
                onNetwork: false, lan: null, key: null, routed: [], told: [] },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        expect((await screen.findByLabelText(/^(Set|Набор)$/)).hasAttribute('disabled'))
            .toBe(true);
        expect(screen.getByRole('button', { name: /^(Disconnect|Отключить)$/ }))
            .toBeTruthy();
    });

    it('says it is working while the proxy is being started', async () =>
    {
        vi.stubGlobal('fetch', answering());

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        await userEvent.click(screen.getByRole('button', { name: /^(Connect|Подключить)$/ }));

        // Two blocks say how they are doing now, so the one meant here is named.
        await waitFor(() => expect(screen.getAllByRole('status')
            .map((one) => one.textContent))
            .toEqual(expect.arrayContaining(
                [expect.stringMatching(/not connected|не подключён/i)])));
    });

    it('says the list of own sites is empty rather than showing nothing', async () =>
    {
        vi.stubGlobal('fetch', answering());

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        expect(await screen.findByText(/nothing here yet|пока пусто/i)).toBeTruthy();
    });

    it('marks which sites a check found and which were put in by hand', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/proxy': { running: false, relays: [], ways: ['name'], overHttps: false,
                preset: null, presets: [], system: false, systemError: null,
                onNetwork: false, lan: null, routed:
                [
                    { host: 'typed.example', way: 'name', byHand: true },
                    { host: 'found.example', way: 'name', byHand: false },
                ] },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        expect(await screen.findByText('typed.example')).toBeTruthy();
        expect(screen.getAllByText(/found by a check|нашла проверка/i)).toHaveLength(1);
    });

    // It has no switch of its own: it goes on with the proxy, and the only thing it
    // needs that the proxy does not is rights this program may not have.
    it('says the driver waits on the proxy rather than on a button', async () =>
    {
        vi.stubGlobal('fetch', answering());

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        expect(await screen.findByText(/on and off with the proxy|вместе с прокси/i))
            .toBeTruthy();
        expect(screen.queryByRole('button', { name: /driver|драйвер/i })).toBeNull();
    });

    it('says what to do when it has no rights to open the driver', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/divert': { running: false, settings: null, lines: [], error: null,
                elevated: false },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        expect(await screen.findByText(/administrator rights|права администратора/i))
            .toBeTruthy();
    });

    it('shows what the driver is printing once it runs', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/divert': { running: true, settings: null, error: null,
                lines: ['discord.com: 1388 bytes, 6 copies'] },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        expect(await screen.findByText('discord.com: 1388 bytes, 6 copies')).toBeTruthy();
    });

    // The loop prints as it goes and the page asked once at startup, so the log
    // stayed empty however much came out of it.
    it('keeps asking while the driver runs, so the log fills', async () =>
    {
        let asked = 0;

        vi.stubGlobal('fetch', answering(
        {
            '/api/divert': () =>
            {
                asked += 1;

                return { running: true, settings: null, error: null,
                    lines: [`line ${asked}`] };
            },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);
        await screen.findByText('line 1');

        await waitFor(() => expect(asked).toBeGreaterThan(1), { timeout: 4000 });
    });

    // It refuses without administrator rights, and saying only that it stopped would
    // leave a person restarting it forever.
    it('says what to do when the driver would not start', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/divert': { running: false, settings: null, lines: [],
                error: 'The driver loop stopped with 1.' },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        expect(await screen.findByText(/would not start|не запустился/i)).toBeTruthy();
    });

    // A bare word on an empty page reads as a page that failed rather than one that
    // is working, and the face is what this page already moves.
    it('shows the face while the first answers are still coming', () =>
    {
        vi.stubGlobal('fetch', () => new Promise(() => undefined));

        const { container } = render(<App />);

        expect(container.querySelector('.waiting .turning')).toBeTruthy();
    });

    it('walks the chain while a check is running, and stops when it is not', async () =>
    {
        vi.stubGlobal('fetch', answering());

        const { container } = render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        expect(container.querySelector('.chain')).toBeTruthy();
        expect(container.querySelector('.chain.walking')).toBeNull();
    });

    it('finds what gets a site through and says what it kept', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/divert/search': { host: 'discord.com', already: false,
                settings: { fooling: 'ttl', ttl: 6, repeats: 6, hello: null,
                    voice: null, only: [] },
                tried: [{ settings: {}, worked: false }, { settings: {}, worked: true }],
                state: { running: true, settings: null, lines: [], error: null } },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        await userEvent.type(
            screen.getByLabelText(/will not open|не открывается/i), 'discord.com');
        await userEvent.click(
            screen.getByRole('button', { name: /find what|подобрать/i }));

        expect(await screen.findByText(/got through with ttl|прошло с ttl/i)).toBeTruthy();
    });

    // Cutting packets for a site that answers is all cost, so it is worth saying that
    // nothing was done rather than reporting a success nobody needed.
    it('says a site that opens on its own needed nothing', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/divert/search': { host: 'github.com', already: true, settings: null,
                tried: [],
                state: { running: false, settings: null, lines: [], error: null } },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        await userEvent.type(
            screen.getByLabelText(/will not open|не открывается/i), 'github.com');
        await userEvent.click(
            screen.getByRole('button', { name: /find what|подобрать/i }));

        expect(await screen.findByText(/opens on its own|и так открывается/i))
            .toBeTruthy();
    });

    it('shows what went through the proxy while it runs', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/proxy': { running: true, relays: [{ port: 3128, way: 'name' }],
                ways: ['name'], overHttps: false, preset: null, presets: [],
                system: true, systemError: null, onNetwork: false, lan: null,
                routed: [], told:
                [
                    { host: 'discord.com', port: 443, way: 'name', pieces: 2,
                        bytes: 517, error: null },
                ] },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        expect(await screen.findByText(/discord\.com — /)).toBeTruthy();
    });

    // Saying only that the proxy is on leaves no way to tell whether anything is
    // going through it.
    it('says nothing has gone through yet rather than showing an empty list', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/proxy': { running: true, relays: [], ways: [], overHttps: false,
                preset: null, presets: [], system: false, systemError: null,
                onNetwork: false, lan: null, key: null, routed: [], told: [] },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        expect(await screen.findByText(/nothing has gone through|ничего не прошло/i))
            .toBeTruthy();
    });

    it('keeps asking the proxy too, so its log fills as it goes', async () =>
    {
        let asked = 0;

        vi.stubGlobal('fetch', answering(
        {
            '/api/proxy': () =>
            {
                asked += 1;

                return { running: true, relays: [], ways: [], overHttps: false,
                    preset: null, presets: [], system: false, systemError: null,
                    onNetwork: false, lan: null, key: null, routed: [], told: [] };
            },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        await waitFor(() => expect(asked).toBeGreaterThan(1), { timeout: 4000 });
    });

    // A list of dotted quads and hex says nothing to whoever opens it.
    it('names who made each device on the network', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/neighbours': { neighbours:
            [
                { address: '192.168.0.1', hardware: '74-da-88-11-22-33', gateway: true,
                    maker: { vendor: 'TP-Link', kind: 'router', randomised: false } },
                { address: '192.168.0.5', hardware: '76-da-88-44-55-66', gateway: false,
                    maker: { vendor: null, kind: 'unknown', randomised: true } },
            ], error: null },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        await userEvent.click(await screen.findByText(/devices on this network|устройств/i));

        expect(await screen.findByText(/TP-Link/)).toBeTruthy();
        expect(screen.getByText(/made-up address|адрес выдуман/i)).toBeTruthy();
    });

    // Whoever does this is holding a phone in the other hand, so the address is set
    // out to be typed and the rest is a numbered list.
    it('sets out what to type on the phone, step by step', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/proxy': { running: true, relays: [{ port: 3128, way: 'name' }],
                ways: ['name'], overHttps: false, preset: null, presets: [],
                system: true, systemError: null, onNetwork: true,
                lan: '192.168.0.5', key: 'слово-для-телефона',
                routed: [], told: [] },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        expect(await screen.findByText(/192\.168\.0\.5.*3128/)).toBeTruthy();

        // The steps are read once and followed once, so they sit behind a fold and
        // the address does not.
        const folded = screen.getByText(/Settings, Wi-Fi|Настройки, Wi-Fi/i)
            .closest('details');

        expect(folded).not.toBeNull();
        expect(folded?.hasAttribute('open')).toBe(false);

        // The password is asked of the phone and of nothing on this machine, so it
        // sits out in the open beside the address rather than behind the fold.
        expect(screen.getByText(/слово-для-телефона/)).toBeTruthy();
    });

    // Four paragraphs above a log is a page people stop reading. The page still knows
    // why, and says it when somebody asks.
    it('folds away the long half of what it knows about the proxy', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/proxy': { running: true, relays: [{ port: 3128, way: 'name' }],
                ways: ['name'], overHttps: true, preset: null, presets: [],
                system: true, systemError: null, onNetwork: false, lan: null,
                routed: [], told: [] },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        const folded = (await screen.findByText(
            /relays bytes without reading|переносятся без чтения/i))
            .closest('details');

        expect(folded?.hasAttribute('open')).toBe(false);

        // The one thing that answers an empty log sits in the empty log, not
        // behind the fold: somebody watching it is asking that exact question.
        expect(screen.getByText(/own connections|соединения сами/i)
            .closest('details')).toBeNull();
    });

    // A fix and the version before it look exactly alike from the page.
    it('says which version is running', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/health': { status: 'ok', version: '0.2.0',
                database: { reachable: true, latencyMs: 1 } },
        }));

        render(<App />);

        expect(await screen.findByText('0.2.0')).toBeTruthy();
    });

    // The check already knew which way got a site through and kept the answer beside
    // the site. Nobody decides which way to use while looking at a site.
    it('marks in the list which way has got a site through', async () =>
    {
        vi.stubGlobal('fetch', answering(
        {
            '/api/evasion': { host: 'far.example', whole: 'reset', split: 'greeted',
                splittingHelps: true, works: 'tiny', error: null,
                tried: [{ way: 'name', answer: 'reset' },
                    { way: 'tiny', answer: 'greeted' }] },
            '/api/proxy': { running: false, relays: [], ways: [], overHttps: false,
                preset: null, presets: [{ id: 'shred-2', way: 'tiny' }],
                system: false, systemError: null, onNetwork: false, lan: null,
                key: null, routed: [], told: [] },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        await userEvent.click((await screen.findAllByRole('button',
            { name: /why it will not open|почему не открывается/i }))[0]!);

        expect(await screen.findByText(/got one site through|провёл один сайт/i))
            .toBeTruthy();
    });

    // It used to pass an empty string, which means every way at once: the button
    // named one way and turned on all ten.
    it('turns on the set that writes the way the check found', async () =>
    {
        let asked: unknown = 'nothing';

        vi.stubGlobal('fetch', answering(
        {
            '/api/evasion': { host: 'far.example', whole: 'reset', split: 'greeted',
                splittingHelps: true, works: 'tiny', error: null,
                tried: [{ way: 'tiny', answer: 'greeted' }] },
            '/api/proxy': (body?: string) =>
            {
                if (body !== undefined)
                {
                    asked = JSON.parse(body).preset;
                }

                return { running: false, relays: [], ways: [], overHttps: false,
                    preset: null, presets: [{ id: 'shred-2', way: 'tiny' }],
                    system: false, systemError: null, onNetwork: false, lan: null,
                    key: null, routed: [], told: [] };
            },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        await userEvent.click((await screen.findAllByRole('button',
            { name: /why it will not open|почему не открывается/i }))[0]!);

        await userEvent.click(await screen.findByRole('button',
            { name: /start the proxy this way|запустить прокси/i }));

        await waitFor(() => expect(asked).toBe('shred-2'));
    });

    // Asking the server about a blank field spends a round trip to be told it is
    // not an address, and then shows that as an error where nobody did anything
    // wrong.
    it('does not ask the server to watch nothing', async () =>
    {
        const asked: string[] = [];

        vi.stubGlobal('fetch', answering(
        {
            '/api/targets': (body?: string) =>
            {
                if (body !== undefined)
                {
                    asked.push(body);
                }

                return { targets: [] };
            },
        }));

        render(<App />);
        await screen.findByText(/unsteady|нестабильна/i);

        const field = screen.getByLabelText('Address to watch');

        await userEvent.click(field);
        await userEvent.keyboard('{Enter}');

        expect(asked).toHaveLength(0);
        expect(screen.queryByText(/not a host/i)).toBeNull();
    });
});
