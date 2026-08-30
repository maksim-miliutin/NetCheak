import { describe, expect, it } from 'vitest';
import { commandsToClear, commandsToSet, readRegistry } from './system.ts';

const PAC = 'http://127.0.0.1:3001/api/proxy.pac';

describe('commandsToSet', () =>
{
    it('writes the setting this user owns on windows', () =>
    {
        const [command] = commandsToSet('win32', PAC);

        expect(command?.file).toBe('reg');
        expect(command?.args).toContain('AutoConfigURL');
        expect(command?.args).toContain(PAC);
    });

    // Under the user's own key, so no administrator is asked for.
    it('never touches the machine-wide key', () =>
    {
        const said = JSON.stringify(commandsToSet('win32', PAC));

        expect(said).toContain('HKCU');
        expect(said).not.toContain('HKLM');
    });

    it('turns the setting on as well as filling it in on a mac', () =>
    {
        const said = JSON.stringify(commandsToSet('darwin', PAC));

        expect(said).toContain('-setautoproxyurl');
        expect(said).toContain('-setautoproxystate');
    });

    it('sets both the mode and the address on linux', () =>
    {
        const said = JSON.stringify(commandsToSet('linux', PAC));

        expect(said).toContain('autoconfig-url');
        expect(said).toContain('mode');
    });
});

describe('commandsToClear', () =>
{
    // A machine left pointed at a proxy that is no longer running is a broken machine,
    // so putting the setting back matters more than setting it.
    it('puts back whatever was there before', () =>
    {
        const said = JSON.stringify(commandsToClear('win32', 'http://elsewhere/pac'));

        expect(said).toContain('http://elsewhere/pac');
        expect(said).not.toContain('delete');
    });

    it('removes the setting when there was nothing before', () =>
    {
        expect(JSON.stringify(commandsToClear('win32', null))).toContain('delete');
        expect(JSON.stringify(commandsToClear('win32', ''))).toContain('delete');
    });

    it('turns it off on a mac', () =>
    {
        expect(JSON.stringify(commandsToClear('darwin', null))).toContain('off');
    });

    it('puts the mode back to none on linux', () =>
    {
        expect(JSON.stringify(commandsToClear('linux', null))).toContain('none');
    });
});

describe('readRegistry', () =>
{
    it('reads the address out of what the registry printed', () =>
    {
        const output = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    AutoConfigURL    REG_SZ    http://old.example/pac
`;

        expect(readRegistry(output)).toBe('http://old.example/pac');
    });

    // Nothing being set is the ordinary case, not a failure.
    it('says nothing when the setting is not there', () =>
    {
        expect(readRegistry('ERROR: The system was unable to find the specified value'))
            .toBeNull();
    });
});
