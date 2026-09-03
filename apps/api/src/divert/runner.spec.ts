import { describe, expect, it } from 'vitest';
import { asArguments, DEFAULTS, Divert, type Running, type Settings } from './runner.ts';

/** A process that never was, so the loop can be started where there is no driver. */
function pretend()
{
    const said: ((chunk: unknown) => void)[] = [];
    const wrong: ((chunk: unknown) => void)[] = [];
    const ended: ((code: number | null) => void)[] = [];
    const launched: string[][] = [];

    let killed = 0;

    const running: Running =
    {
        stdout: { on: (_event, listen) => said.push(listen) },
        stderr: { on: (_event, listen) => wrong.push(listen) },
        on: (_event, listen) => ended.push(listen),
        kill: () => { killed += 1; },
    };

    return {
        launched,
        killed: () => killed,
        say: (text: string) => said.forEach((listen) => listen(text)),
        complain: (text: string) => wrong.forEach((listen) => listen(text)),
        end: (code: number | null) => ended.forEach((listen) => listen(code)),
        launch: (args: string[]) => { launched.push(args); return running; },
    };
}

const SETTINGS: Settings = { ...DEFAULTS, hello: 'bin\\hello.bin' };

describe('asArguments', () =>
{
    it('says the same words a person would type', () =>
    {
        expect(asArguments(SETTINGS))
            .toEqual(['fooling=ttl', 'ttl=6', 'repeats=6', 'hello=bin\\hello.bin']);
    });

    it('leaves out what was not given rather than passing nothing along', () =>
    {
        expect(asArguments(DEFAULTS).some((one) => one.startsWith('hello='))).toBe(false);
        expect(asArguments(DEFAULTS).some((one) => one.startsWith('voice='))).toBe(false);
    });
});

describe('Divert', () =>
{
    it('says nothing is running before it is asked to run anything', () =>
    {
        const state = new Divert(pretend().launch).state();

        expect(state.running).toBe(false);
        expect(state.settings).toBeNull();
    });

    it('starts the loop with the settings it was given', () =>
    {
        const fake = pretend();

        new Divert(fake.launch).start(SETTINGS);

        expect(fake.launched).toHaveLength(1);
        expect(fake.launched[0]).toContain('hello=bin\\hello.bin');
    });

    it('keeps the lines the loop prints, in the order they came', () =>
    {
        const fake = pretend();
        const divert = new Divert(fake.launch);

        divert.start(SETTINGS);
        fake.say('discord.com: 1388 bytes, 6 copies\nudp:1->19306: 60 bytes, 6 copies\n');

        expect(divert.state().lines).toEqual(
        [
            'discord.com: 1388 bytes, 6 copies',
            'udp:1->19306: 60 bytes, 6 copies',
        ]);
    });

    // A loop that refuses says so on the other stream, and swallowing it left the
    // page with an empty log and no reason for it.
    it('keeps what the loop complained about as well as what it printed', () =>
    {
        const fake = pretend();
        const divert = new Divert(fake.launch);

        divert.start(SETTINGS);
        fake.complain('The driver did not start.\n');

        expect(divert.state().lines).toEqual(['The driver did not start.']);
    });

    it('does not keep a day of them', () =>
    {
        const fake = pretend();
        const divert = new Divert(fake.launch);

        divert.start(SETTINGS);

        for (let i = 0; i < 500; i += 1)
        {
            fake.say(`line ${i}\n`);
        }

        expect(divert.state().lines).toHaveLength(200);
        expect(divert.state().lines.at(-1)).toBe('line 499');
    });

    // Two loops would open the driver twice and cut every packet twice over.
    it('stops the one that was running before starting another', () =>
    {
        const fake = pretend();
        const divert = new Divert(fake.launch);

        divert.start(SETTINGS);
        divert.start({ ...SETTINGS, fooling: 'badseq' });

        expect(fake.killed()).toBe(1);
        expect(fake.launched).toHaveLength(2);
    });

    it('forgets the lines of the run before', () =>
    {
        const fake = pretend();
        const divert = new Divert(fake.launch);

        divert.start(SETTINGS);
        fake.say('from the first run\n');
        divert.start(SETTINGS);

        expect(divert.state().lines).toEqual([]);
    });

    it('stops when it is told to', () =>
    {
        const fake = pretend();
        const divert = new Divert(fake.launch);

        divert.start(SETTINGS);

        expect(divert.stop().running).toBe(false);
        expect(fake.killed()).toBe(1);
    });

    it('minds being stopped when nothing was running', () =>
    {
        expect(() => new Divert(pretend().launch).stop()).not.toThrow();
    });

    // The loop refuses without administrator rights, and it is the only thing that
    // ever refuses this way, so the guess is worth making for the reader.
    it('says why it stopped when it stopped by itself', () =>
    {
        const fake = pretend();
        const divert = new Divert(fake.launch);

        divert.start(SETTINGS);
        fake.end(1);

        expect(divert.state().running).toBe(false);
        expect(divert.state().error).toMatch(/administrator/i);
    });

    it('says nothing went wrong when it was the one to end it', () =>
    {
        const fake = pretend();
        const divert = new Divert(fake.launch);

        divert.start(SETTINGS);
        fake.end(null);

        expect(divert.state().error).toBeNull();
    });
});

describe('what the driver is told', () =>
{
    it('leaves out a recording that was not made', () =>
    {
        const said = asArguments({ ...DEFAULTS, hello: null, voice: null });

        expect(said.join(' ')).not.toContain('hello=');
        expect(said.join(' ')).not.toContain('voice=');
    });

    // Six copies went to every site the machine spoke to, and every one of them paid
    // for a trick meant for another.
    it('names the sites it is for, when it is for some and not all', () =>
    {
        const said = asArguments({ ...DEFAULTS, only: ['discord.com', 'youtube.com'] });

        expect(said).toContain('only=discord.com,youtube.com');
    });

    it('says nothing about names when it is for everything', () =>
    {
        expect(asArguments(DEFAULTS).some((one) => one.startsWith('only=')))
            .toBe(false);
    });

    it('names both recordings when both were made', () =>
    {
        const said = asArguments(
            { ...DEFAULTS, hello: 'bin/hello.bin', voice: 'bin/voice.bin' });

        expect(said).toContain('hello=bin/hello.bin');
        expect(said).toContain('voice=bin/voice.bin');
    });
});
