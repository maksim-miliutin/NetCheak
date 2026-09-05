import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { DEFAULTS, Divert, type DivertState, type Settings } from '../divert/runner.ts';
import { candidates, findSettings, type Found } from '../divert/search.ts';
import { inspectTls } from '../tls/handshake.ts';
import { badRequest, hostFrom } from './refusal.ts';
import { elevated } from '../divert/elevated.ts';
import type { ChecksRepository } from '../db/checks.repository.ts';

const FOOLING = ['badsum', 'badseq', 'ttl', 'none'];

/** A script rather than part of this program: the call it waits inside blocks. */
const SCRIPT = join('tools', 'divert-run.mjs');

// Taken by default: the button has nowhere to type a path, and a driver without a
// recorded hello does the weaker of the two things it knows.
const RECORDED = { hello: join('bin', 'hello.bin'), voice: join('bin', 'voice.bin') };

/** Says whether the driver is cutting, for whoever has to tell the truth about it. */
export type Cutting = () => boolean;

/**
 * Turning the proxy on turns this on too. They are one thing to whoever presses the
 * button — everything that will not go through — and two only because one of them
 * needs rights the other does not.
 */
export interface Alongside
{
    start(): DivertState;
    stop(): DivertState;
    running(): boolean;
}

/** What a search answered: what it kept, what it tried, and where things stand now. */
export interface Searched extends Found
{
    host: string;
    state: DivertState;
}

/** What a search came back with, so the page can say it without guessing. */
export interface Searched extends Found
{
    host: string;
    state: DivertState;
}

// Long enough for the driver to be watching, short enough that eight is a wait.
const SETTLING_MS = 700;

export interface DivertRoutes
{
    repository: ChecksRepository;
    /** Passed in so a test does not spend eight real seconds. */
    settle?: (ms: number) => Promise<void>;
}

export function divertRoutes(app: FastifyInstance,
    { repository, settle }: DivertRoutes): Alongside
{
    const waiting = settle ?? ((ms: number) =>
        new Promise<void>((done) => setTimeout(done, ms)));

    const divert = new Divert((args) =>
        spawn(process.execPath, [SCRIPT, ...args], { windowsHide: true }));

    app.addHook('onClose', async () => void divert.stop());

    app.get('/api/divert', async () => ({ ...divert.state(), elevated: elevated() }));

    // Cutting packets for the whole machine is not something to start by accident.
    app.post<{ Body: { running?: boolean } & Partial<Settings> }>('/api/divert',
        async (request) =>
        {
            if (request.body?.running !== true)
            {
                return divert.stop();
            }

            if (!existsSync(SCRIPT))
            {
                throw badRequest('The driver loop is not beside this program. It lives '
                    + 'in tools, next to the rest of the source.');
            }

            return divert.start(settingsFrom(request.body, repository));
        });

    // Doing this by hand took an afternoon, and knowing what to change.
    app.post<{ Body: { target?: string } & Partial<Settings> }>('/api/divert/search',
        async (request): Promise<Searched> =>
        {
            const { host, port } = hostFrom(request.body?.target,
                'That is not a host to search for');

            if (!existsSync(SCRIPT))
            {
                throw badRequest('The driver loop is not beside this program.');
            }

            const { hello, voice } = settingsFrom(request.body, repository);

            const found = await findSettings(
            {
                // While searching, only the site being searched for is helped: the
                // answer has to be about it and not about whatever else was open.
                candidates: candidates(hello, voice, [host]),
                start: async (settings) => void divert.start(settings),
                stop: async () => void divert.stop(),
                settle: () => waiting(SETTLING_MS),
                // A completed handshake is the whole question: a site that lets one
                // through is a site that opens.
                answers: async () =>
                {
                    const seen = await inspectTls(host, port);

                    return seen.handshake === 'completed';
                },
            });

            if (found.settings !== null)
            {
                repository.rememberDriver(
                {
                    host,
                    fooling: found.settings.fooling,
                    ttl: found.settings.ttl,
                    repeats: found.settings.repeats,
                });
            }

            return { ...found, host, state: divert.state() };
        });

    app.get('/api/divert/found', async () => ({ found: repository.listDriverFound() }));

    /**
     * Helps another site with settings that already worked somewhere. A filter is one
     * thing, and searching again for each site would spend a minute apiece to arrive
     * at the answer already in hand.
     */
    app.post<{ Body: { host?: string; like?: string } }>('/api/divert/found',
        async (request) =>
        {
            const { host } = hostFrom(request.body?.host, 'That is not a host');
            const already = repository.listDriverFound();

            const like = request.body?.like === undefined
                ? already[0]
                : already.find((one) => one.host === request.body?.like);

            if (like === undefined)
            {
                throw badRequest('Nothing has been found for any site yet, so there '
                    + 'is nothing to copy. Search for one first.');
            }

            repository.rememberDriver({ ...like, host });

            return { found: repository.listDriverFound() };
        });

    app.delete<{ Params: { host: string } }>('/api/divert/found/:host',
        async (request) =>
        {
            repository.forgetDriver(request.params.host);

            return { found: repository.listDriverFound() };
        });

    return {
        start: () => existsSync(SCRIPT) && elevated()
            ? divert.start(settingsFrom({}, repository))
            : divert.state(),
        stop: () => divert.stop(),
        running: () => divert.state().running,
    };
}

/** What was asked for, refusing what it cannot do rather than meaning another. */
function settingsFrom(body: Partial<Settings>, repository: ChecksRepository): Settings
{
    const fooling = body.fooling ?? DEFAULTS.fooling;

    if (!FOOLING.includes(fooling))
    {
        throw badRequest(`No such way of spoiling a copy: ${fooling}`);
    }

    const ttl = Number(body.ttl ?? DEFAULTS.ttl);
    const repeats = Number(body.repeats ?? DEFAULTS.repeats);

    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 255)
    {
        throw badRequest('Hops are counted from one to two hundred and fifty five');
    }

    if (!Number.isInteger(repeats) || repeats < 1 || repeats > 64)
    {
        throw badRequest('Copies are counted from one to sixty four');
    }

    for (const file of [body.hello, body.voice])
    {
        if (file !== null && file !== undefined && !existsSync(file))
        {
            throw badRequest(`There is nothing recorded at ${file}`);
        }
    }

    return {
        fooling,
        ttl,
        repeats,
        hello: body.hello ?? recorded('hello'),
        voice: body.voice ?? recorded('voice'),

        // What was searched for and found something. Until anything has been, this is
        // empty and every site is helped: better clumsy than useless on a first run.
        only: body.only ?? repository.listDriverFound().map((one) => one.host),
    };
}

/** A recording if one was made, and nothing if none was. */
function recorded(which: 'hello' | 'voice'): string | null
{
    return existsSync(RECORDED[which]) ? RECORDED[which] : null;
}
