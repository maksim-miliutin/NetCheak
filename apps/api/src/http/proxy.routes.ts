import type { FastifyInstance } from 'fastify';
import { startProxy } from '../proxy/proxy.ts';
import { WAYS, type Way } from '../proxy/ways.ts';
import { inOrder, presetById } from '../proxy/presets.ts';
import { buildPac } from '../proxy/pac.ts';
import { lanAddress } from '../proxy/lan.ts';
import { clearSystemProxy, setSystemProxy } from '../proxy/system.ts';
import { choosePort } from './port.ts';

interface Relay
{
    way: Way;
    port: number;
    server: ReturnType<typeof startProxy>;
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

    private systemSet = false;

    private previous: string | null = null;

    /** Hosts that needed a different way of writing, with the way that worked. */
    private readonly needing = new Map<string, Way>();

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
                    gapMs: chosen?.gapMs, onNetwork }),
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
    async stop(): Promise<void>
    {
        for (const relay of this.relays)
        {
            relay.server.close();
        }

        this.relays = [];
        this.preset = null;
        this.onNetwork = false;

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

    state(): Record<string, unknown>
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
        };
    }
}

export interface ProxyRoutes
{
    proxies: Proxies;
    /** Where this server is reachable, so the system can be pointed at its own file. */
    port: number;
}

export function proxyRoutes(app: FastifyInstance, { proxies, port }: ProxyRoutes): void
{
    /**
     * One proxy per way, each on its own port, unless a preset names one. Different
     * sites are stopped by different filters, so a single way serves one of them and
     * fails the rest.
     */
    app.post<{ Body: { overHttps?: boolean; preset?: string; onNetwork?: boolean } }>(
        '/api/proxy',
        async (request) =>
        {
            if (proxies.running)
            {
                await proxies.stop();

                return proxies.state();
            }

            await proxies.start(
                request.body?.preset,
                request.body?.overHttps ?? true,
                request.body?.onNetwork === true,
                `http://127.0.0.1:${port}/api/proxy.pac`);

            return proxies.state();
        });

    app.get('/api/proxy', async () => proxies.state());

    /**
     * The file a browser reads instead of being pointed at a proxy outright. Less of
     * a person's traffic passing through this tool is the point, not more.
     */
    app.get('/api/proxy.pac', async (request, reply) =>
    {
        return reply.type('application/x-ns-proxy-autoconfig').send(proxies.pac());
    });
}
