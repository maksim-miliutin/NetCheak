import type { StatusRow, History } from '../db/checks.repository.ts';
import type { Verdict } from '../verdict/verdict.ts';
import type { DnsCheck } from '../dns/resolve.ts';
import type { TlsCheck } from '../tls/handshake.ts';
import type { Rings } from '../route/rings.ts';

export interface Sheet
{
    verdict: Verdict;
    targets: StatusRow[];
    history: History[];
    rings: Rings | null;
    dns: DnsCheck | null;
    tls: TlsCheck[];
}

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
    lines.push('about pages visited or traffic contents.');

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
