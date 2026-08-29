import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.ts';
import type { ChecksRepository } from '../db/checks.repository.ts';
import { measureTarget } from '../probe/probe.ts';
import { judge } from '../verdict/verdict.ts';
import { CLOUDFLARE, measureSpeed } from '../speed/transfer.ts';
import { probeRings } from '../route/rings.ts';
import { LastSeen } from './lastseen.ts';
import { findTunnels } from '../route/tunnels.ts';
import { checkSixth } from '../route/sixth.ts';
import { findNeighbours } from '../route/neighbours.ts';
import { traceTo } from '../route/traceroute.ts';
import { report } from '../report/report.ts';
import { findMtu } from '../mtu/mtu.ts';
import { findCut } from '../tls/cut.ts';
import { tryEvasion } from '../tls/evasion.ts';
import { startProxy } from '../proxy/proxy.ts';
import { WAYS, type Way } from '../proxy/ways.ts';
import { buildPac } from '../proxy/pac.ts';
import { choosePort } from './port.ts';
import { outbound } from '../report/outbound.ts';
import { checkUpdate } from '../update/version.ts';
import { checkDns } from '../dns/resolve.ts';
import { inspectTls } from '../tls/handshake.ts';
import { isAddress, parseTarget } from '../targets/address.ts';

export interface ServerOptions
{
    /** The running version, so the update check has something to compare against. */
    version?: string;
    db: Database;
    repository: ChecksRepository;
    logLevel?: string;
    allowedOrigins?: string[];
}

interface RunBody
{
    attempts?: number;
    timeoutMs?: number;
}

// The dev server proxies the API, so its origin has to pass. Everything the packaged
// app serves is same-origin and carries the listening address instead.
const DEV_ORIGINS =
[
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
];

// The box takes what a person has to hand, so a refusal has to say which part of it
// was the problem rather than that the whole thing was wrong.
const REFUSALS: Record<string, string> =
{
    'empty': 'Type an address to watch',
    'bad-port': 'The port has to be a whole number between 1 and 65535',
    'bad-host': 'That does not look like a host name or an address',
    'too-long': 'That name is longer than a name is allowed to be',
};

function badRequest(message: string): FastifyError
{
    return failure(message, 400);
}

function failure(message: string, statusCode: number): FastifyError
{
    const err = new Error(message) as FastifyError;
    err.statusCode = statusCode;

    return err;
}

export async function buildServer(options: ServerOptions): Promise<FastifyInstance>
{
    // Probing the gateway takes about a second and a half, and reading the page must
    // not wait for it: what the checks found is kept, with the moment each was found,
    // so a report can say when it is describing more than one minute.
    const seen = new LastSeen();

    // Turned on by the first ask, so the list of what leaves this machine can tell
    // the truth about whether it happens.
    let watchingForUpdates = false;

    // Off until asked for. It relays bytes without looking at them, but it is still a
    // thing standing between the browser and the network, and that is not something
    // to switch on behind somebody's back.
    let proxy: { server: ReturnType<typeof startProxy>; port: number; way: Way } | null = null;

    // Hosts where a different way of writing was needed. Only these go through the
    // proxy: routing everything through it would put traffic there that has no
    // reason to be.
    const needing = new Set<string>();

    const { db, repository } = options;

    const app = Fastify(
    {
        logger: { level: options.logLevel ?? 'info' },

        // Own generator instead of Fastify's counter: after a restart the counter
        // starts from one again and ids stop being unique in the logs.
        genReqId: () => randomUUID(),
    });

    const allowed = new Set(options.allowedOrigins ?? DEV_ORIGINS);

    await app.register(cors, { origin: [...allowed] });

    // CORS alone is not enough. A cross-site POST with a plain content type skips the
    // preflight, so the browser only hides the answer while the work still happens:
    // any page the user has open could make this machine open connections to hosts of
    // its choosing, or spend the user's traffic on speed runs. The request has to be
    // refused before it reaches a route.
    app.addHook('onRequest', async (request) =>
    {
        const origin = request.headers.origin;

        if (origin !== undefined && !allowed.has(origin))
        {
            throw failure('This API only answers its own interface', 403);
        }
    });

    app.addHook('onSend', async (request, reply) =>
    {
        reply.header('x-request-id', request.id);
    });

    app.setErrorHandler((err: FastifyError, request, reply) =>
    {
        const status = err.statusCode ?? 500;

        if (status >= 500)
        {
            request.log.error({ err }, 'unhandled error');
        }

        // Details of a 5xx stay in the log: stack traces and SQL in the response
        // body are a gift to whoever is looking for a way in.
        return reply.status(status).send(
        {
            error:
            {
                message: status >= 500 ? 'Internal server error' : err.message,
                requestId: request.id,
            },
        });
    });
    app.setNotFoundHandler((request, reply) =>
        {
            return reply.status(404).send(
            {
                error:
                {
                    message: `Route ${request.method} ${request.url} not found`,
                    requestId: request.id,
                },
            });
        });
    app.get('/api/health', async () =>
    {
        try
        {
            return { status: 'ok', database: { reachable: true, latencyMs: db.ping() } };
        }
        catch (err)
        {
            const error = (err as Error).message;

            return { status: 'degraded', database: { reachable: false, error } };
        }
    });

    app.get('/api/targets', async () => ({ targets: repository.listTargets() }));

    // Every run has been stored since the first version and nothing read more than the
    // last one, which left the hardest case — a line that drops now and then — invisible.
    app.get('/api/history', async () => ({ targets: repository.history() }));

    // A tunnel changes which route the traffic takes, and a check that looks strange
    // often looks that way because it left through one.
    app.get('/api/tunnels', async () => findTunnels());

    // A machine with an address of the sixth version it cannot use is worse off than
    // one without: the browser tries that family first and waits for it to fail.
    app.post('/api/sixth', async () =>
    {
        seen.put('sixth', await checkSixth());

        return seen.get('sixth');
    });

    // Who else is on this network. A house with a dozen devices and an evening of
    // stuttering usually has its answer here, and nothing else in the tool looks.
    app.get('/api/neighbours', async () =>
    {
        const found = await findNeighbours(seen.get('rings')?.gateway?.host ?? null);

        seen.put('neighbours', found.error === null ? found.neighbours.length : null);

        return found;
    });

    // A person telling their provider the line is bad is rarely believed. The same
    // measurements as plain text can be pasted into a ticket by somebody who will
    // never open this tool.
    app.get('/api/report', async (request, reply) =>
    {
        const targets = repository.latestStatus();

        const text = report({
            verdict: judge(targets, seen.get('rings') ?? undefined, seen.get('dns') ?? undefined,
                seen.get('tls')),
            targets,
            history: repository.history(),
            oldestMs: seen.oldestMs(),
            ...seen.all(),
        });

        return reply.type('text/plain; charset=utf-8').send(text);
    });

    app.post<{ Body: { target?: string } }>('/api/targets', async (request) =>
    {
        const parsed = parseTarget(request.body?.target ?? '');

        if (!parsed.ok)
        {
            throw badRequest(REFUSALS[parsed.refusal]);
        }

        const { host, port } = parsed.address;

        return { target: repository.addTarget(host, host, port) };
    });

    app.delete<{ Params: { id: string } }>('/api/targets/:id', async (request, reply) =>
    {
        const id = Number.parseInt(request.params.id, 10);

        if (!Number.isInteger(id) || !repository.removeTarget(id))
        {
            throw failure('No target with that id', 404);
        }

        return reply.code(204).send();
    });

    app.get('/api/status', async () =>
    {
        const targets = repository.latestStatus();

        return {
            verdict: judge(targets, seen.get('rings') ?? undefined),
            targets,
            speed: repository.latestSpeed(),
            rings: seen.get('rings'),
        };
    });

    // Asking two resolvers the same name is the only way to tell a broken lookup from
    // one that answers with somebody else's address.
    app.post('/api/dns', async () =>
    {
        seen.put('dns', await checkDns());

        return seen.get('dns');
    });

    // Pages open and large files stall: the usual cause is a packet size the path will
    // not carry whole. No ordinary speed test shows it.
    app.post<{ Body: { target?: string } }>('/api/mtu', async (request) =>
    {
        const parsed = parseTarget(request.body?.target ?? '');

        if (!parsed.ok)
        {
            throw badRequest(REFUSALS[parsed.refusal] ?? 'That is not a host to measure');
        }

        const path = await findMtu(parsed.address.host);

        seen.put('paths', [...seen.get('paths').filter((p) => p.host !== path.host), path]);

        return path;
    });

    // Whether something along the way objects to the name rather than to the address.
    app.post<{ Body: { target?: string } }>('/api/cut', async (request) =>
    {
        const parsed = parseTarget(request.body?.target ?? '');

        if (!parsed.ok)
        {
            throw badRequest(REFUSALS[parsed.refusal] ?? 'That is not a host to check');
        }

        return await findCut(parsed.address.host, parsed.address.port);
    });

    // Whether the block in the way is one that splitting the write gets past. This
    // measures that it would work; it does not do it, which would mean a driver in
    // the kernel and the rights that come with one.
    app.post<{ Body: { target?: string } }>('/api/evasion', async (request) =>
    {
        const parsed = parseTarget(request.body?.target ?? '');

        if (!parsed.ok)
        {
            throw badRequest(REFUSALS[parsed.refusal] ?? 'That is not a host to try');
        }

        const found = await tryEvasion(parsed.address.host, parsed.address.port);

        if (found.splittingHelps)
        {
            needing.add(parsed.address.host);
        }

        return found;
    });

    /**
     * A proxy the browser can be pointed at, which cuts the first write so no single
     * packet carries the wanted name. On CONNECT it relays bytes blind: the traffic
     * stays encrypted end to end and this holds no key to any of it.
     */
    app.post<{ Body: { way?: string } }>('/api/proxy', async (request) =>
    {
        if (proxy !== null)
        {
            proxy.server.close();
            proxy = null;

            return { running: false, port: null, way: null, ways: WAYS };
        }

        const asked = request.body?.way;
        const way: Way = WAYS.includes(asked as Way) ? asked as Way : 'name';

        const { port } = await choosePort(3128);

        proxy = { server: startProxy({ port, way }), port, way };

        return { running: true, port, way, ways: WAYS };
    });

    app.get('/api/proxy', async () => ({
        running: proxy !== null,
        port: proxy?.port ?? null,
        way: proxy?.way ?? null,
        ways: WAYS,
    }));

    /**
     * The file a browser reads instead of being pointed at the proxy outright. Less
     * of a person's traffic passing through this tool is the point.
     */
    app.get('/api/proxy.pac', async (request, reply) =>
    {
        const pac = buildPac([...needing], proxy?.port ?? 3128);

        return reply.type('application/x-ns-proxy-autoconfig').send(pac);
    });

    app.addHook('onClose', async () => proxy?.server.close());

    // Everywhere this tool sends a packet, built from the values the code uses. A
    // promise about privacy written in prose goes stale the first time somebody adds
    // a call; this list cannot.
    app.get('/api/outbound', async () =>
        outbound(repository.listTargets(), watchingForUpdates, proxy?.port ?? null));

    // Off unless asked for. A tool that promises no telemetry cannot quietly phone
    // home, however good the reason, so the ask is a button rather than a habit.
    app.post('/api/update', async () =>
    {
        watchingForUpdates = true;

        return await checkUpdate(options.version ?? '0.0.0');
    });

    // Which hop the packets stop at is the one question the layered checks cannot
    // answer: they say the far end is silent, not where along the way it went quiet.
    app.post<{ Body: { target?: string } }>('/api/trace', async (request) =>
    {
        const parsed = parseTarget(request.body?.target ?? '');

        if (!parsed.ok)
        {
            throw badRequest(REFUSALS[parsed.refusal] ?? 'That is not a host to trace');
        }

        return await traceTo(parsed.address.host);
    });

    // Who issued the certificate says more than whether the handshake worked: a name
    // that matches and an issuer nobody expected is what interception looks like.
    app.post('/api/tls', async () =>
    {
        const named = repository.listTargets()
            .filter((t) => t.enabled && !isAddress(t.host));

        const checks = await Promise.all(named.map((t) => inspectTls(t.host, t.port)));

        seen.put('tls', checks);

        // The verdict is recomputed here so a cut handshake reaches the headline: the
        // probe sees no loss when the connection opens and is severed afterwards.
        return { checks, verdict: judge(repository.latestStatus(), undefined, undefined, checks) };
    });

    // The measurement runs against a CDN rather than against this server: a transfer
    // to localhost would report the speed of the loopback interface.
    app.post('/api/speed', async () =>
    {
        const result = await measureSpeed(CLOUDFLARE);

        repository.saveSpeed(result);

        return result;
    });

    app.post('/api/checks', async (request) =>
    {
        const body = (request.body ?? {}) as RunBody;
        const attempts = body.attempts ?? 5;
        const timeoutMs = body.timeoutMs ?? 3000;

        if (!Number.isInteger(attempts) || attempts < 1 || attempts > 50)
        {
            throw badRequest('attempts must be an integer between 1 and 50');
        }

        if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000)
        {
            throw badRequest('timeoutMs must be an integer between 100 and 30000');
        }

        const targets = repository.listTargets().filter((t) => t.enabled);
        const checkId = repository.createCheck(attempts, timeoutMs);

        // Targets run in parallel: ten of them at five attempts with a three second
        // timeout would take two and a half minutes in sequence. The nearest hop is
        // asked alongside them, since it decides how a total silence is read.
        const [measured, hop] = await Promise.all(
        [
            Promise.all(targets.map(async (t) =>
            ({
                id: t.id,
                result: await measureTarget({ name: t.name, host: t.host, port: t.port },
                    { attempts, timeoutMs }),
            }))),
            probeRings(),
        ]);

        seen.put('rings', hop);

        for (const { id, result } of measured)
        {
            repository.saveResult(checkId, id, result);
        }

        // Swept here rather than on a schedule of its own: the file only grows when a
        // check writes to it, so that is the moment to take the old rows out.
        repository.prune();

        return { checkId, results: measured.map((v) => v.result) };
    });

    return app;
}