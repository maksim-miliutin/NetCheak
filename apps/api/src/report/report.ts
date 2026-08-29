import type { StatusRow, History } from '../db/checks.repository.ts';
import type { Verdict } from '../verdict/verdict.ts';
import type { DnsCheck } from '../dns/resolve.ts';
import type { TlsCheck } from '../tls/handshake.ts';
import type { Rings } from '../route/rings.ts';
import type { SixthCheck } from '../route/sixth.ts';
import type { Path } from '../mtu/mtu.ts';

export interface Sheet
{
    /** How long ago the oldest measurement here was taken. */
    oldestMs: number | null;
    neighbours: number | null;
    sixth: SixthCheck | null;
    paths: Path[];
    verdict: Verdict;
    targets: StatusRow[];
    history: History[];
    rings: Rings | null;
    dns: DnsCheck | null;
    tls: TlsCheck[];
}

/** Past this, a reader deserves to be told the numbers are from different minutes. */
const STALE_MS = 120_000;

const SIXTH: Record<string, string> =
{
    'working': 'carries traffic',
    'broken': 'an address is held but leads nowhere, so every connection waits for it '
        + 'to fail first',
    'link-local-only': 'an address was found but nothing was tried against it',
    'absent': 'not configured',
};

const SAID: Record<Verdict['cause'], string> =
{
    'none': 'Everything answered',
    'never-checked': 'Nothing measured yet',
    'link': 'Nothing reachable, cause not narrowed',
    'router': 'The gateway did not answer',
    'provider': 'The gateway answers, nothing past it does',
    'dns': 'Names did not resolve',
    'sinkholed': 'A name resolved to an address nobody can route to',
    'filtered': 'Names resolve, the connections still fail',
    'handshake-cut': 'Connections open and are cut during the handshake',
    'remote': 'Some hosts are down, the rest answer',
    'unstable': 'Answers arrive with losses or wandering latency',
};

/**
 * A person telling their provider the line is bad is rarely believed. This is the
 * same measurements as plain text, so it can be pasted into a ticket by somebody who
 * will not be asked to open the tool themselves.
 */
export function report(sheet: Sheet, at = new Date()): string
{
    const lines: string[] = [];

    lines.push('netcheck report');
    lines.push(at.toISOString());
    lines.push('');
    lines.push(`Verdict: ${SAID[sheet.verdict.cause]}`);

    // Six separate variables held these findings before, none remembering when. A
    // report can describe more than one minute, and saying so is the difference
    // between a measurement and an impression.
    if (sheet.oldestMs !== null && sheet.oldestMs > STALE_MS)
    {
        lines.push(`Some of this is up to ${Math.round(sheet.oldestMs / 60_000)}`
            + ' minutes old. Run the checks again for a report of one moment.');
    }

    if (sheet.verdict.blame.length > 0)
    {
        lines.push(`Concerning: ${sheet.verdict.blame.join(', ')}`);
    }

    lines.push('');
    lines.push('Targets');

    for (const target of sheet.targets)
    {
        lines.push(`  ${target.name} (${target.host}:${target.port})`);
        lines.push(`    loss ${number(target.lossPercent, '%')}`
            + `  average ${number(target.averageMs, ' ms')}`
            + `  jitter ${number(target.jitterMs, ' ms')}`);

        const past = sheet.history.find((h) => h.targetId === target.targetId);

        if (past !== undefined && past.runs.length > 1)
        {
            lines.push(`    ${past.lossyRuns} of the last ${past.runs.length}`
                + ' checks lost packets');
        }
    }

    // A count and nothing more. Hardware addresses name particular devices, and this
    // text is written to be handed to somebody the reader has never met.
    if (sheet.neighbours !== null)
    {
        lines.push('');
        lines.push(`Devices seen on this network: ${sheet.neighbours}`);
    }

    // The two findings a provider argues with most, so they go in plainly.
    if (sheet.sixth !== null && sheet.sixth.state !== 'absent')
    {
        lines.push('');
        lines.push(`IPv6: ${SIXTH[sheet.sixth.state]}`);
    }

    const short = sheet.paths.filter((path) => path.mtu !== null && path.mtu < path.ordinary);

    if (short.length > 0)
    {
        lines.push('');
        lines.push('Packet size');

        for (const path of short)
        {
            lines.push(`  ${path.host}: ${path.mtu} bytes cross whole,`
                + ` where ${path.ordinary} is usual`);
        }
    }

    if (sheet.rings?.gateway != null)
    {
        lines.push('');
        lines.push(`Gateway ${sheet.rings.gateway.host}: ${sheet.rings.gateway.answer}`);
    }

    if (sheet.dns !== null)
    {
        lines.push('');
        lines.push('Name lookup');
        lines.push(`  ${sheet.dns.name}: ${sheet.dns.agreement}`);
        lines.push(`    ${answer(sheet.dns.system?.server, sheet.dns.system?.addresses)}`);
        lines.push(`    ${answer(sheet.dns.reference.server, sheet.dns.reference.addresses)}`);
    }

    if (sheet.tls.length > 0)
    {
        lines.push('');
        lines.push('Certificates');

        for (const check of sheet.tls)
        {
            const signed = check.certificate === null
                ? check.error ?? 'no certificate'
                : `signed by ${check.certificate.issuer}`;

            lines.push(`  ${check.host}: ${check.handshake}, ${signed}`);
        }
    }

    lines.push('');

    // Anybody pasting this into a ticket deserves to know what they are handing over.
    lines.push('This report holds host names, timings and verdicts. It carries nothing');
    lines.push('about pages visited, traffic contents, or which devices are in the house.');

    return lines.join('\n');
}

function number(value: number | null, unit: string): string
{
    return value === null ? '—' : `${Math.round(value * 10) / 10}${unit}`;
}

function answer(server: string | undefined, addresses: string[] | undefined): string
{
    if (server === undefined)
    {
        return 'no system resolver could be read';
    }

    const found = addresses === undefined || addresses.length === 0
        ? 'no answer'
        : addresses.join(', ');

    return `${server} said ${found}`;
}
