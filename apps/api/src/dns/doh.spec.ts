import { describe, expect, it, vi } from 'vitest';
import { addressesIn, askUrl, resolveOverHttps } from './doh.ts';

const answering = (body: unknown, ok = true) =>
    vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

describe('askUrl', () =>
{
    it('asks for the name and the kind of record', () =>
    {
        const url = askUrl('https://dns.example/query', 'example.com', 1);

        expect(url).toContain('name=example.com');
        expect(url).toContain('type=1');
    });

    // A resolver may already carry parameters of its own.
    it('keeps what the resolver address already said', () =>
    {
        expect(askUrl('https://dns.example/query?ct=json', 'a.test', 28)).toContain('ct=json');
    });
});

describe('addressesIn', () =>
{
    it('takes addresses of both families', () =>
    {
        const answer = { Answer: [
            { type: 1, data: '93.184.216.34' },
            { type: 28, data: '2606:2800:220::1' },
        ] };

        expect(addressesIn(answer)).toEqual(['93.184.216.34', '2606:2800:220::1']);
    });

    // A name pointing at another name is bookkeeping, not somewhere to connect.
    it('leaves out records that are not addresses', () =>
    {
        const answer = { Answer: [
            { type: 5, data: 'elsewhere.example' },
            { type: 1, data: '1.1.1.1' },
        ] };

        expect(addressesIn(answer)).toEqual(['1.1.1.1']);
    });

    it('copes with an answer carrying nothing', () =>
    {
        expect(addressesIn({})).toEqual([]);
        expect(addressesIn({ Answer: [] })).toEqual([]);
    });
});

describe('resolveOverHttps', () =>
{
    it('hands back what the resolver said, and who said it', async () =>
    {
        const fetcher = answering({ Answer: [{ type: 1, data: '93.184.216.34' }] });
        const found = await resolveOverHttps('example.com', fetcher, ['https://dns.example/q']);

        expect(found.addresses).toContain('93.184.216.34');
        expect(found.from).toBe('dns.example');
        expect(found.error).toBeNull();
    });

    // One resolver being unreachable is the ordinary case in the situation this tool
    // is used in, so a single failure is not the end of it.
    it('moves on to the next resolver when the first fails', async () =>
    {
        let asked = 0;

        const fetcher = vi.fn(async (url: string) =>
        {
            asked += 1;

            if (url.startsWith('https://first'))
            {
                throw new Error('unreachable');
            }

            const answer = { Answer: [{ type: 1, data: '1.1.1.1' }] };
            const good = { ok: true, json: async () => answer };

            return good as unknown as Response;
        });

        const found = await resolveOverHttps('a.test', fetcher,
            ['https://first.example/q', 'https://second.example/q']);

        expect(found.addresses).toEqual(['1.1.1.1', '1.1.1.1']);
        expect(found.from).toBe('second.example');
        expect(asked).toBeGreaterThan(2);
    });

    it('says so when nobody answered', async () =>
    {
        const failing = vi.fn(async () => { throw new Error('nothing out there'); });
        const found = await resolveOverHttps('a.test', failing, ['https://only.example/q']);

        expect(found.addresses).toEqual([]);
        expect(found.error).toBe('nothing out there');
    });

    // An empty answer is not an answer: it would leave nowhere to connect.
    it('treats an answer with no addresses as no answer', async () =>
    {
        const found = await resolveOverHttps('a.test', answering({ Answer: [] }),
            ['https://only.example/q']);

        expect(found.error).toContain('no addresses');
    });

    it('treats a refusal as no answer', async () =>
    {
        const found = await resolveOverHttps('a.test', answering(null, false),
            ['https://only.example/q']);

        expect(found.addresses).toEqual([]);
    });
});
