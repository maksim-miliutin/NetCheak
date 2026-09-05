import type { FastifyInstance } from 'fastify';
import { startProxy, type Told } from '../proxy/proxy.ts';
import { networkKey } from '../access/secret.ts';
import { WAYS, type Way } from '../proxy/ways.ts';
import { inOrder, presetById, presetFor } from '../proxy/presets.ts';
import { tryEvasion } from '../tls/evasion.ts';
import { hostFrom } from './refusal.ts';
import { buildPac } from '../proxy/pac.ts';
import { lanAddress } from '../proxy/lan.ts';
import { clearSystemProxy, setSystemProxy } from '../proxy/system.ts';
import { choosePort } from './port.ts';
import { looksLikeHost } from '../targets/address.ts';
import type { Alongside } from './divert.routes.ts';
import type { RoutedHost } from '../db/checks.repository.ts';
import type { Preset } from '../proxy/presets.ts';

/**
 * Where the map of routed hosts is kept between launches. Narrower than the whole
 * repository on purpose: this class has no business reading a check.
 */
const TOLD = 120;

export interface RouteBook
{
    listRouted(): RoutedHost[];
    routeHost(host: string, way: string, byHand: boolean): void;
    forgetRoute(host: string): boolean;
}

interface Relay
{
    way: Way;
    port: number;
    server: ReturnType<typeof startProxy>;
}

/**
 * What the page is told about the proxy. It was a bag of unknowns, and the page kept
 * its own copy of the shape by hand — which drifted the first time a field was added
 * to one side only.
 */
export interface ProxyState
{
    running: boolean;
    relays: { way: Way; port: number }[];
    ways: Way[];
    overHttps: boolean;
    preset: string | null;
    presets: Preset[];
    system: boolean;
    systemError: string | null;
    onNetwork: boolean;
    lan: string | null;

    /** The word a phone must carry, shown only while the network is served. */
    key: string | null;
    routed: RoutedHost[];
    told: Told[];
}

/**
 * What is running and what was changed to make it run. Six variables held this beside
 * the routes, and one of them — what the system proxy setting held before — decides
 * whether a machine is left pointed at something that has stopped.
 */
export class Proxies
{
    private relays: Relay[] = [];

    private preset: string | null = null;

    private overHttps = true;

    private onNetwork = false;

    // Where the database lives, so the network key can sit beside it. Passed in
    // rather than found here: this class keeps proxies, not paths.
    private readonly beside: string;

    private systemSet = false;

    private previous: string | null = null;

    /** Hosts that needed a different way of writing, with the way that worked. */
    private readonly needing = new Map<string, Way>();

    // Enough to see it going, and not enough to hold an evening of browsing. Kept in
    // memory only: a list of the sites somebody opened is the one thing this tool
    // promises not to keep.
    private told: Told[] = [];

    private readonly book: RouteBook | null;

    /**
     * The map is read once at startup, so the routing file is complete before the
     * first page is asked for. Without it a blocked site went the plain way again
     * after every restart, and the tool looked like it had forgotten.
     */
    constructor(book: RouteBook | null = null, beside = 'netcheck.db')
    {
        this.book = book;
        this.beside = beside;

        for (const row of book?.listRouted() ?? [])
        {
            this.needing.set(row.host, row.way as Way);
        }
    }

    get running(): boolean
    {
        return this.relays.length > 0;
    }

    get port(): number | null
    {
        return this.relays[0]?.port ?? null;
    }

    get encrypted(): boolean
    {
        return this.running && this.overHttps;
    }

    remember(host: string, way: Way): void
    {
        this.needing.set(host, way);
        this.book?.routeHost(host, way, false);
    }

    route(host: string, way: Way): void
    {
        this.needing.set(host, way);
        this.book?.routeHost(host, way, true);
    }

    forget(host: string): boolean
    {
        this.book?.forgetRoute(host);

        return this.needing.delete(host);
    }

    routed(): RoutedHost[]
    {
        if (this.book !== null)
        {
            return this.book.listRouted();
        }

        return [...this.needing].map(([host, way]) => ({ host, way, byHand: false }));
    }

    async start(preset: string | undefined, overHttps: boolean, onNetwork: boolean,
        pacUrl: string): Promise<void>
    {
        const chosen = presetById(preset ?? '');

        this.overHttps = chosen?.overHttps ?? overHttps;
        this.onNetwork = onNetwork;
        this.preset = chosen?.id ?? null;

        let next = 3128;

        for (const way of chosen === null ? WAYS : [chosen.way])
        {
            const { port } = await choosePort(next);

            this.relays.push({
                way,
                port,
                server: startProxy({ port, way, overHttps: this.overHttps,
                    gapMs: chosen?.gapMs, onNetwork, watch: (one) => this.heard(one),
                    key: onNetwork ? networkKey(this.beside).word : undefined }),
            });

            next = port + 1;
        }

        const applied = await setSystemProxy(pacUrl);

        this.systemSet = applied.set;
        this.previous = applied.was;
    }

    /**
     * Stopping puts the system setting back to whatever it held. A machine left
     * pointed at a proxy that is no longer listening is a machine that cannot reach
     * anything, which is a worse state than the one this was meant to fix.
     */
    private heard(one: Told): void
    {
        // A closing fills in the line the opening left, rather than adding a second
        // one: two lines for one connection is a log twice as long saying half as
        // much.
        if (one.carried !== undefined)
        {
            const at = this.told.findLastIndex((seen) =>
                seen.host === one.host && seen.port === one.port
                    && seen.carried === undefined);

            if (at !== -1)
            {
                this.told = this.told.map((seen, i) =>
                    i === at ? { ...seen, carried: one.carried } : seen);
            }

            return;
        }

        this.told = [...this.told, one].slice(-TOLD);
    }

    async stop(): Promise<void>
    {
        for (const relay of this.relays)
        {
            relay.server.close();
        }

        this.relays = [];
        this.preset = null;
        this.onNetwork = false;
        this.told = [];

        if (this.systemSet)
        {
            await clearSystemProxy(this.previous);
            this.systemSet = false;
            this.previous = null;
        }
    }

    /** Each host to the port whose way of writing got it through, and nothing else. */
    pac(): string
    {
        const routed = [...this.needing].map(([host, way]) => (
        {
            host,
            port: this.relays.find((relay) => relay.way === way)?.port
                ?? this.relays[0]?.port ?? 3128,
        }));

        return buildPac(routed, this.relays.map(({ way, port }) => ({ way, port })));
    }

    state(): ProxyState
    {
        return {
            running: this.running,
            relays: this.relays.map(({ way, port }) => ({ way, port })),
            ways: WAYS,
            overHttps: this.encrypted,
            preset: this.preset,
            presets: inOrder(),
            system: this.systemSet,
            systemError: null,
            onNetwork: this.onNetwork,
            lan: this.onNetwork ? lanAddress() : null,
            key: this.onNetwork ? networkKey(this.beside).word : null,
            routed: this.routed(),
            told: [...this.told],
        };
    }
}

export interface ProxyRoutes
{
    proxies: Proxies;
    /** Where this server is reachable, so the system can be pointed at its own file. */
    port: number;

    /** The driver, which goes on and off with this and reaches where this cannot. */
    alongside: Alongside;
}

export function proxyRoutes(app: FastifyInstance,
    { proxies, port, alongside }: ProxyRoutes): void
{
    /**
     * One proxy per way, each on its own port, unless a preset names one. Different
     * sites are stopped by different filters, so a single way serves one of them and
     * fails the rest.
     */
    /**
     * Finds the set that gets a site through and turns it on, in one press.
     *
     * All of this could be done by hand already: add the site, ask why it will not
     * open, read which way got through, press the button beside it. Four steps to
     * arrive somewhere the machine could have walked to on its own.
     */
    app.post<{ Body: { host?: string } }>('/api/proxy/search', async (request) =>
    {
        const { host } = hostFrom(request.body?.host, 'That is not a host to try');
        const tried = await tryEvasion(host);

        if (tried.error !== null)
        {
            return { host, tried, preset: null, started: false, error: tried.error };
        }

        // Nothing to do for a site that opens on its own, and turning a proxy on for
        // it would be all cost.
        const preset = presetFor(tried.works);

        if (preset === null)
        {
            return { host, tried, preset: null, started: false, error: null };
        }

        if (proxies.running)
        {
            await proxies.stop();
        }

        await proxies.start(preset.id, true, false,
            `http://127.0.0.1:${port}/api/proxy.pac`);

        return { host, tried, preset: preset.id, started: true, error: null };
    });

    app.post<{ Body: { overHttps?: boolean; preset?: string; onNetwork?: boolean } }>(
        '/api/proxy',
        async (request) =>
        {
            if (proxies.running)
            {
                await proxies.stop();
                alongside.stop();

                return proxies.state();
            }

            await proxies.start(
                request.body?.preset,
                request.body?.overHttps ?? true,
                request.body?.onNetwork === true,
                `http://127.0.0.1:${port}/api/proxy.pac`);

            // The proxy reaches what asks the system where to go; the driver reaches
            // the rest. One button, because to whoever presses it they are one thing.
            alongside.start();

            return proxies.state();
        });

    app.get('/api/proxy', async () => proxies.state());

    /**
     * A host the person routes by hand. Nothing about a visit is stored: this is a
     * name they typed and the way of writing they want it sent with.
     */
    app.post<{ Body: { host?: string; way?: string } }>('/api/proxy/routes',
        async (request, reply) =>
        {
            const host = (request.body?.host ?? '').trim().toLowerCase();
            const way = request.body?.way ?? '';

            if (!looksLikeHost(host))
            {
                return reply.code(400).send({ error: 'not a host name' });
            }

            if (!WAYS.includes(way as Way))
            {
                return reply.code(400).send({ error: 'no such way of writing' });
            }

            proxies.route(host, way as Way);

            return proxies.state();
        });

    app.delete<{ Params: { host: string } }>('/api/proxy/routes/:host',
        async (request, reply) =>
        {
            if (!proxies.forget(request.params.host.toLowerCase()))
            {
                return reply.code(404).send({ error: 'not routed' });
            }

            return proxies.state();
        });

    /**
     * The file a browser reads instead of being pointed at a proxy outright. Less of
     * a person's traffic passing through this tool is the point, not more.
     */
    app.get('/api/proxy.pac', async (request, reply) =>
    {
        return reply.type('application/x-ns-proxy-autoconfig').send(proxies.pac());
    });
}
