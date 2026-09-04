import { describe, expect, it } from 'vitest';
import
{
    bestOf,
    blamed,
    bookmarklet,
    BREAKS,
    CHAIN,
    format,
    hopState,
    linkState,
    readEvasion,
    readSize,
    readTrace,
    stopsAt,
} from './page';
import type { Answered, Cause, Evasion, Path, Trace, Verdict } from '../types';

const CAUSES: Cause[] =
[
    'none', 'never-checked', 'link', 'router', 'provider',
    'dns', 'sinkholed', 'filtered', 'handshake-cut', 'remote', 'unstable',
];

describe('BREAKS', () =>
{
    // A cause added to the verdict without a link here would point at nothing and
    // draw a chain with no break in it at all.
    it.each(CAUSES)('says something about %s', (cause) =>
    {
        expect(cause in BREAKS).toBe(true);
    });

    it('only ever points at a link that exists', () =>
    {
        for (const link of Object.values(BREAKS))
        {
            expect(link === null || CHAIN.includes(link)).toBe(true);
        }
    });
});

describe('stopsAt', () =>
{
    it('stops at the router when the router is silent', () =>
    {
        expect(stopsAt('router')).toBe(CHAIN.indexOf('Router'));
    });

    // Nothing about the chain broke, so the check reached the end of it.
    it('reaches the end when the fault is somewhere else', () =>
    {
        expect(stopsAt('none')).toBe(CHAIN.length);
        expect(stopsAt('remote')).toBe(CHAIN.length);
        expect(stopsAt('unstable')).toBe(CHAIN.length);
    });
});

describe('linkState', () =>
{
    const stops = stopsAt('provider');

    it('marks what the check got past', () =>
    {
        expect(linkState(0, stops, 'provider')).toContain('passed');
        expect(linkState(1, stops, 'provider')).toContain('passed');
    });

    it('marks where it stopped', () =>
    {
        expect(linkState(stops, stops, 'provider')).toContain('broken');
    });

    // The check never got there, so drawing it as healthy would be an invention.
    it('claims nothing about what lies past the break', () =>
    {
        expect(linkState(stops + 1, stops, 'provider')).toContain('untested');
    });

    it('claims nothing at all before anything has run', () =>
    {
        for (let i = 0; i < CHAIN.length; i += 1)
        {
            expect(linkState(i, stopsAt('never-checked'), 'never-checked'))
                .toContain('untested');
        }
    });
});

describe('readEvasion', () =>
{
    const evasion = (whole: Answered, helps: boolean): Evasion =>
        ({ host: 'a.test', whole, split: 'reset', splittingHelps: helps,
            tried: [], works: null, error: null });

    it('says so when a way through was found', () =>
    {
        expect(readEvasion(evasion('reset', true))).toBe('helps');
    });

    // The hello went through whole, so there is nothing here to get past.
    it('says there is nothing to get past when it went through', () =>
    {
        expect(readEvasion(evasion('greeted', false))).toBe('no-block');
    });

    it('admits when none of the ways helped', () =>
    {
        expect(readEvasion(evasion('reset', false))).toBe('no-help');
    });
});

describe('hopState', () =>
{
    // Plenty of routers decline to answer while passing traffic along perfectly well.
    it('says nothing about a quiet hop with answers after it', () =>
    {
        expect(hopState({ number: 2, times: [null] }, null)).toBe('hop passing');
    });

    it('marks the hop where the answers stop for good', () =>
    {
        expect(hopState({ number: 5, times: [null] }, 5)).toBe('hop silent');
        expect(hopState({ number: 6, times: [null] }, 5)).toBe('hop silent');
    });

    it('leaves an answering hop alone', () =>
    {
        expect(hopState({ number: 1, times: [12] }, 5)).toBe('hop');
    });
});

describe('bestOf', () =>
{
    it('takes the quickest of the probes', () =>
    {
        expect(bestOf([30, 12, 44])).toBe('12 ms');
    });

    it('ignores the ones that never came back', () =>
    {
        expect(bestOf([null, 20, null])).toBe('20 ms');
    });

    it('says nothing when none came back', () =>
    {
        expect(bestOf([null, null])).toBe('—');
        expect(bestOf([])).toBe('—');
    });
});

describe('format', () =>
{
    // Nothing measured is not the same as measured as none.
    it('writes a dash rather than a zero for nothing', () =>
    {
        expect(format(null, ' ms')).toBe('—');
        expect(format(0, '%')).toBe('0%');
    });

    it('carries the unit', () =>
    {
        expect(format(12.4, ' ms')).toBe('12.4 ms');
    });
});

describe('readSize', () =>
{
    const path = (over: Partial<Path>): Path =>
        ({ host: 'a.test', mtu: 1500, ordinary: 1500, error: null, ...over });

    it('calls out a size below the usual one', () =>
    {
        expect(readSize(path({ mtu: 1392 }))).toBe('short');
    });

    // The usual size is not a finding.
    it('says nothing much when the size is the usual one', () =>
    {
        expect(readSize(path({}))).toBe('full');
    });

    it('says it does not know when nothing was measured', () =>
    {
        expect(readSize(path({ mtu: null }))).toBe('unknown');
        expect(readSize(path({ error: 'no ping here' }))).toBe('unknown');
    });
});

describe('readTrace', () =>
{
    const trace = (over: Partial<Trace>): Trace =>
        ({ target: 'a.test', hops: [], silentFrom: null, error: null, ...over });

    it('separates a trace that failed from one that found nothing', () =>
    {
        expect(readTrace(trace({ error: 'not installed' }))).toBe('error');
        expect(readTrace(trace({}))).toBe('empty');
    });

    it('says it has hops when it has them', () =>
    {
        const hops = [{ number: 1, host: null, address: '10.0.0.1', times: [1] }];

        expect(readTrace(trace({ hops }))).toBe('hops');
    });
});

describe('bookmarklet', () =>
{
    it('carries the address of this tool', () =>
    {
        expect(bookmarklet('http://127.0.0.1:3001', '/')).toContain('127.0.0.1:3001');
    });

    it('asks the browser for the host it is on', () =>
    {
        expect(bookmarklet('http://x', '/')).toContain('location.host');
    });

    // A quote inside the address would end the string and leave whatever follows as
    // code, which is the shape of every attack of this kind.
    it('quotes the address rather than pasting it in', () =>
    {
        expect(bookmarklet('http://x"+alert(1)+"', '/')).toContain('\\"');
    });
});

describe('blamed', () =>
{
    const verdict = (blame: string[]): Verdict =>
        ({ level: 'warn', cause: 'remote', reachable: 1, total: 3, blame });

    it('names one on its own', () =>
    {
        expect(blamed(verdict(['A']), 'and')).toBe('A');
    });

    it('joins the last with the word it was given', () =>
    {
        expect(blamed(verdict(['A', 'B', 'C']), 'and')).toBe('A, B and C');
        expect(blamed(verdict(['A', 'B']), 'и')).toBe('A и B');
    });

    it('says nothing when there is nobody to blame', () =>
    {
        expect(blamed(verdict([]), 'and')).toBe('');
    });
});
