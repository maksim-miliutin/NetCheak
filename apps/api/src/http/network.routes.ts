import type { FastifyInstance } from 'fastify';
import type { ChecksRepository } from '../db/checks.repository.ts';
import { checkDns } from '../dns/resolve.ts';
import { findMtu } from '../mtu/mtu.ts';
import { findNeighbours } from '../route/neighbours.ts';
import { checkSixth } from '../route/sixth.ts';
import { traceTo } from '../route/traceroute.ts';
import { findTunnels } from '../route/tunnels.ts';
import { findCut } from '../tls/cut.ts';
import { tryEvasion } from '../tls/evasion.ts';
import { inspectTls } from '../tls/handshake.ts';
import { presetFor } from '../proxy/presets.ts';
import { isAddress } from '../targets/address.ts';
import { judge } from '../verdict/verdict.ts';
import { hostFrom } from './refusal.ts';
import type { LastSeen } from './lastseen.ts';
import type { Proxies } from './proxy.routes.ts';

export interface NetworkRoutes
{
    repository: ChecksRepository;
    /** What each check last found, so the report can be written without rerunning them. */
    seen: LastSeen;
    proxies: Proxies;
}

/**
 * Everything that asks the network a question about one layer. They travel together
 * because they answer the same shape of question and share what they found through
 * the same place; the routes that write to the database do not belong here.
 */
export function networkRoutes(app: FastifyInstance,
    { repository, seen, proxies }: NetworkRoutes): void
{
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
        const address = hostFrom(request.body?.target, 'That is not a host to measure');
        const path = await findMtu(address.host);

        seen.put('paths', [...seen.get('paths').filter((p) => p.host !== path.host), path]);

        return path;
    });

    // Whether something along the way objects to the name rather than to the address.
    app.post<{ Body: { target?: string } }>('/api/cut', async (request) =>
    {
        const address = hostFrom(request.body?.target, 'That is not a host to check');

        return await findCut(address.host, address.port);
    });

    // Whether the block in the way is one that splitting the write gets past. This
    // measures that it would work; it does not do it, which would mean a driver in
    // the kernel and the rights that come with one.
    app.post<{ Body: { target?: string } }>('/api/evasion', async (request) =>
    {
        const address = hostFrom(request.body?.target, 'That is not a host to try');
        const found = await tryEvasion(address.host, address.port);

        // Which way worked is remembered with the host: the routing file sends it to
        // the port running that way, not to whichever proxy happens to be first.
        if (found.splittingHelps && found.works !== null)
        {
            proxies.remember(address.host, found.works);
        }

        // Naming the way and leaving a person to match it against a list of presets
        // is half an answer; the preset to reach for goes with it.
        return { ...found, preset: presetFor(found.works)?.id ?? null };
    });

    // Which hop the packets stop at is the one question the layered checks cannot
    // answer: they say the far end is silent, not where along the way it went quiet.
    app.post<{ Body: { target?: string } }>('/api/trace', async (request) =>
    {
        return await traceTo(hostFrom(request.body?.target, 'That is not a host to trace').host);
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
}
