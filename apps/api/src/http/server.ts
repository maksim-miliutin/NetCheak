import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database';
import type { ChecksRepository } from '../db/checks.repository';
import { measureTarget } from '../probe/probe';

export interface ServerOptions
{
    db: Database;
    repository: ChecksRepository;
    logLevel?: string;
    corsOrigin?: string;
}

interface RunBody
{
    attempts?: number;
    timeoutMs?: number;
}

function badRequest(message: string): FastifyError
{
    const err = new Error(message) as FastifyError;
    err.statusCode = 400;

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

    await app.register(cors, { origin: options.corsOrigin ?? true });

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

    app.get('/api/health', async () =>
    {
        try
        {
            return { status: 'ok', database: { reachable: true, latencyMs: await db.ping() } };
        }
        catch (err)
        {
            return { status: 'degraded', database: { reachable: false, error: (err as Error).message } };
        }
    });

    app.get('/api/targets', async () => ({ targets: await repository.listTargets() }));

    app.get('/api/status', async () => ({ targets: await repository.latestStatus() }));

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

        const targets = (await repository.listTargets()).filter((t) => t.enabled);
        const checkId = await repository.createCheck(attempts, timeoutMs);

        // Targets run in parallel: ten of them at five attempts with a three second
        // timeout would take two and a half minutes in sequence.
        const results = await Promise.all(
            targets.map((t) => measureTarget({ name: t.name, host: t.host, port: t.port }, { attempts, timeoutMs })),
        );

        for (let i = 0; i < results.length; i += 1)
        {
            await repository.saveResult(checkId, targets[i].id, results[i]);
        }

        return { checkId, results };
    });

    return app;
}