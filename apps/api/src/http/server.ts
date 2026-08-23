import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.ts';
import type { ChecksRepository } from '../db/checks.repository.ts';
import { measureTarget } from '../probe/probe.ts';
import { judge } from '../verdict/verdict.ts';
import { CLOUDFLARE, measureSpeed } from '../speed/transfer.ts';
import { probeRings } from '../route/rings.ts';

export interface ServerOptions
{
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

    app.get('/api/status', async () =>
    {
        const targets = repository.latestStatus();

        // The nearest hop is cheap to ask about and decides whether a dead internet is
        // the router's doing or the provider's, so it is read on every status call.
        const rings = await probeRings();

        return { verdict: judge(targets, rings), targets, speed: repository.latestSpeed(), rings };
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
        // timeout would take two and a half minutes in sequence.
        const measured = await Promise.all(targets.map(async (t) =>
        ({
            id: t.id,
            result: await measureTarget({ name: t.name, host: t.host, port: t.port },
                { attempts, timeoutMs }),
        })));

        for (const { id, result } of measured)
        {
            repository.saveResult(checkId, id, result);
        }

        return { checkId, results: measured.map((v) => v.result) };
    });

    return app;
}