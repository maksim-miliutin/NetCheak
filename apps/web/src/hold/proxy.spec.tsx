import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useProxy } from './proxy.ts';

// Named .tsx though it draws nothing: in this repo the extension says whether a
// test needs a document, and a hook does.

const state = { running: true, relays: [], ways: [], overHttps: false, preset: null,
    presets: [], system: true, systemError: null, onNetwork: false, lan: null,
    key: null, routed: [], told: [] };

beforeEach(() =>
{
    vi.stubGlobal('fetch', vi.fn(async () =>
        ({ ok: true, status: 200, json: async () => state }) as Response));
});

describe('useProxy', () =>
{
    it('holds nothing until something is asked of it', () =>
    {
        const { result } = renderHook(() => useProxy(() => undefined));

        expect(result.current.state).toBeNull();
        expect(result.current.switching).toBe(false);
    });

    it('says it is switching while it switches, and stops saying so after', async () =>
    {
        const { result } = renderHook(() => useProxy(() => undefined));

        await act(async () => { await result.current.toggle(); });

        await waitFor(() => expect(result.current.switching).toBe(false));
        expect(result.current.state).not.toBeNull();
    });

    // A blank line is not a site, and asking the server about one wastes a
    // round trip to be told so.
    it('does not ask the server to route nothing', async () =>
    {
        const { result } = renderHook(() => useProxy(() => undefined));

        await act(async () => { await result.current.add(); });

        expect(fetch).not.toHaveBeenCalled();
    });

    it('clears what was typed once the site is kept', async () =>
    {
        const { result } = renderHook(() => useProxy(() => undefined));

        act(() => result.current.typeSite('blocked.example'));
        await act(async () => { await result.current.add(); });

        expect(result.current.typedSite).toBe('');
    });

    // The same four lines wrapped seven handlers in the page, and this is what
    // they were all for.
    it('hands a failure to whoever asked rather than swallowing it', async () =>
    {
        vi.stubGlobal('fetch', vi.fn(async () =>
            ({ ok: false, status: 500, json: async () => ({}) }) as Response));

        const said: string[] = [];
        const { result } = renderHook(() => useProxy((about) => said.push(about)));

        await act(async () => { await result.current.toggle(); });

        expect(said).toHaveLength(1);
        expect(result.current.switching).toBe(false);
    });
});
