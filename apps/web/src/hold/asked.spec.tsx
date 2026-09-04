import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAsked } from './asked.ts';

// Named .tsx though it draws nothing: in this repo the extension says whether a
// test needs a document, and a hook does.

const outbound = { errands: [], promises: [] };
const newer = { current: '0.2.0', latest: 'v0.2.0', behind: false, error: null };

beforeEach(() =>
{
    vi.stubGlobal('fetch', vi.fn(async (where: string) =>
        ({
            ok: true,
            status: 200,
            json: async () => String(where).includes('update') ? newer : outbound,
        }) as Response));
});

describe('useAsked', () =>
{
    it('holds nothing until somebody asks', () =>
    {
        const { result } = renderHook(() => useAsked(() => undefined));

        expect(result.current.leaves).toBeNull();
        expect(result.current.newer).toBeNull();
    });

    it('brings the list of what leaves this machine', async () =>
    {
        const { result } = renderHook(() => useAsked(() => undefined));

        await act(async () => { await result.current.showLeaves(); });

        expect(result.current.leaves).not.toBeNull();
    });

    // It is a drawer, and a drawer that only opens is a drawer nobody closes.
    it('puts the list away when asked a second time', async () =>
    {
        const { result } = renderHook(() => useAsked(() => undefined));

        await act(async () => { await result.current.showLeaves(); });
        await act(async () => { await result.current.showLeaves(); });

        expect(result.current.leaves).toBeNull();
    });

    // The update check is one of the things on that list, and it has just run.
    it('closes the list after checking for a newer version', async () =>
    {
        const { result } = renderHook(() => useAsked(() => undefined));

        await act(async () => { await result.current.showLeaves(); });
        await act(async () => { await result.current.lookForUpdate(); });

        expect(result.current.newer).not.toBeNull();
        expect(result.current.leaves).toBeNull();
    });

    it('hands a failure to whoever asked', async () =>
    {
        vi.stubGlobal('fetch', vi.fn(async () =>
            ({ ok: false, status: 500, json: async () => ({}) }) as Response));

        const said: string[] = [];
        const { result } = renderHook(() => useAsked((about) => said.push(about)));

        await act(async () => { await result.current.showLeaves(); });

        expect(said).toHaveLength(1);
    });
});
