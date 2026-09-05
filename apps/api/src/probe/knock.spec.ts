import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { knock, knockedFor } from './knock.ts';

const open: Server[] = [];

afterEach(() =>
{
    for (const server of open.splice(0))
    {
        server.close();
    }
});

function listening(): Promise<number>
{
    return new Promise((resolve) =>
    {
        const server = createServer();

        open.push(server);
        server.listen(0, '127.0.0.1', () =>
            resolve((server.address() as { port: number }).port));
    });
}

describe('knock', () =>
{
    it('says a port somebody holds answered, and how long it took', async () =>
    {
        const knocked = await knock('127.0.0.1', await listening(), 2000);

        expect(knocked.answer).toBe('answered');
        expect(knocked.latencyMs).not.toBeNull();
    });

    // A refusal came from a machine. That is a different thing from silence, and
    // half of telling a dead service from a dead route is knowing which.
    it('times a refusal too, because somebody answered it', async () =>
    {
        const knocked = await knock('127.0.0.1', 1, 2000);

        expect(knocked.answer).toBe('refused');
        expect(knocked.latencyMs).not.toBeNull();
        expect(knocked.code).toBe('ECONNREFUSED');
    });

    /**
     * Whether an address nobody routes goes silent or is refused depends on what
     * sits between here and it: a machine on its own network times out, one behind
     * something that answers for it is refused at once. What holds either way is
     * that the knock settles and does not hang.
     */
    it('settles on an address nobody routes rather than hanging', async () =>
    {
        const started = Date.now();
        const knocked = await knock('192.0.2.1', 443, 300);

        expect(Date.now() - started).toBeLessThan(2000);
        expect(knocked.answer).not.toBe('answered');
    }, 5000);
});

describe('knockedFor', () =>
{
    it.each(['ECONNREFUSED', 'ECONNRESET'])('reads %s as a refusal', (code) =>
    {
        expect(knockedFor(code)).toBe('refused');
    });

    it.each(['EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', undefined])(
        'reads %s as silence', (code) =>
    {
        expect(knockedFor(code)).toBe('silent');
    });
});
