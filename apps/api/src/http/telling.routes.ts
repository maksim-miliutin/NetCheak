import type { FastifyInstance } from 'fastify';
import type { ChecksRepository } from '../db/checks.repository.ts';
import { report } from '../report/report.ts';
import { outbound } from '../report/outbound.ts';
import { checkUpdate } from '../update/version.ts';
import { judge } from '../verdict/verdict.ts';
import type { LastSeen } from './lastseen.ts';
import type { Proxies } from './proxy.routes.ts';

export interface TellingRoutes
{
    repository: ChecksRepository;
    seen: LastSeen;
    proxies: Proxies;
    /** The running version, so the update check has something to compare against. */
    version: string;
    /** Whether the driver is cutting right now, for the list of what leaves. */
    cutting: () => boolean;
}

/**
 * What the tool says about itself: the findings as plain text, everywhere it sends a
 * packet, and whether a newer version exists. None of it asks the network a question
 * about the connection, which is why it is not next door.
 */
export function tellingRoutes(app: FastifyInstance,
    { repository, seen, proxies, version, cutting }: TellingRoutes): void
{
    // Asked for rather than assumed, and remembered, because the list below has to
    // say whether this machine has spoken to the update server at all.
    let watchingForUpdates = false;

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

    // Everywhere this tool sends a packet, built from the values the code uses. A
    // promise about privacy written in prose goes stale the first time somebody adds
    // a call; this list cannot.
    app.get('/api/outbound', async () =>
        outbound(repository.listTargets(), watchingForUpdates,
            proxies.port, proxies.encrypted, cutting()));

    // Off unless asked for. A tool that promises no telemetry cannot quietly phone
    // home, however good the reason, so the ask is a button rather than a habit.
    app.post('/api/update', async () =>
    {
        watchingForUpdates = true;

        return await checkUpdate(version);
    });
}
