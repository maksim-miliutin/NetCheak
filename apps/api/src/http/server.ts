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
import { Proxies, proxyRoutes } from './proxy.routes.ts';
import { networkRoutes } from './network.routes.ts';
import { divertRoutes } from './divert.routes.ts';
import { tellingRoutes } from './telling.routes.ts';
import { badRequest, failure, hostFrom } from './refusal.ts';
import { mayAsk } from '../access/allowed.ts';
import type { Health, Status } from './wire.ts';

export interface ServerOptions
{
    /** Where this server is reachable, so the system can be pointed at its file. */
    port?: number;
    /** The running version, so the update check has something to compare against. */
    version?: string;
    db: Database;
    repository: ChecksRepository;

    /** Where the database sits, so the network key can be kept beside and not in it. */
    databaseFile?: string;
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

export async function buildServer(options: ServerOptions): Promise<FastifyInstance>
{
    // Probing the gateway takes about a second and a half, and reading the page must
    // not wait for it: what the checks found is kept, with the moment each was found,
    // so a report can say when it is describing more than one minute.
    const seen = new LastSeen();

    // Off until asked for. It relays bytes without looking at them, but it is still a
    // thing standing between the browser and the network, and that is not something
    // to switch on behind somebody's back.
    const proxies = new Proxies(options.repository, options.databaseFile);

    const { db, repository } = options;

    const app = Fastify(
    {
        logger: { level: options.logLevel ?? 'info' },

        // Own generator instead of Fastify's counter: after a restart the counter
        // starts from one again and ids stop being unique in the logs.
        genReqId: () => randomUUID(),

        // Told to stop, it stops. A browser tab holds its connection open for over a
        // minute after the last request, and waiting for that is a program that looks
        // hung to whoever just closed it.
        forceCloseConnections: true,
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
        if (!mayAsk(request.headers.origin, allowed))
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

    const version = options.version ?? '0.0.0';

    const alongside = divertRoutes(app, { repository });

    proxyRoutes(app, { proxies, port: options.port ?? 3001, alongside });
    networkRoutes(app, { repository, seen, proxies });

    tellingRoutes(app, { repository, seen, proxies, version,
        cutting: alongside.running });

    app.get('/api/health', async (): Promise<Health> =>
    {
        try
        {
            return { status: 'ok', version, database: { reachable: true,
                latencyMs: db.ping() } };
        }
        catch (err)
        {
            const error = (err as Error).message;

            return { status: 'degraded', version, database: { reachable: false, error } };
        }
    });

    app.get('/api/targets', async () => ({ targets: repository.listTargets() }));

    // Every run has been stored since the first version and nothing read more than the
    // last one, which left the hardest case — a line that drops now and then — invisible.
    app.get('/api/history', async () => ({ targets: repository.history() }));

    app.post<{ Body: { target?: string } }>('/api/targets', async (request) =>
    {
        const { host, port } = hostFrom(request.body?.target, 'That is not a host to watch');

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

    app.get('/api/status', async (): Promise<Status> =>
    {
        const targets = repository.latestStatus();

        return {
            verdict: judge(targets, seen.get('rings') ?? undefined),
            targets,
            speed: repository.latestSpeed(),
            rings: seen.get('rings'),
        };
    });

    // Closing without putting the setting back would leave the machine pointed at a
    // proxy that has stopped, which is worse than never having started.
    app.addHook('onClose', async () => await proxies.stop());

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