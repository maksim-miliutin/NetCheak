export interface Split
{
    /** Where to cut the first write, or null to send it whole. */
    at: number | null;
    why: 'name' | 'middle' | 'not-a-hello';
}

const HANDSHAKE = 0x16;

/**
 * Where to cut a first write so no single packet carries the wanted name whole. The
 * name is found in the record rather than guessed at: a fixed offset lands in the
 * middle of the name for one site and nowhere near it for another.
 */
export function splitPoint(first: Buffer): Split
{
    if (first.length < 6 || first[0] !== HANDSHAKE)
    {
        return { at: null, why: 'not-a-hello' };
    }

    const name = findName(first);

    if (name === -1)
    {
        return { at: Math.floor(first.length / 2), why: 'middle' };
    }

    // Two bytes in, so the first packet holds a fragment of the name and the second
    // holds the rest: neither is the string a filter is looking for.
    return { at: name + 2, why: 'name' };
}

/** The server name sits in its own extension, written out as plain text. */
export function findName(hello: Buffer): number
{
    for (let i = 0; i < hello.length - 4; i += 1)
    {
        // The extension is numbered zero and says how long the name inside it is.
        if (hello[i] === 0x00 && hello[i + 1] === 0x00)
        {
            const length = ((hello[i + 7] ?? 0) << 8) + (hello[i + 8] ?? 0);
            const start = i + 9;

            if (length > 0 && start + length <= hello.length && looksLikeName(hello, start, length))
            {
                return start;
            }
        }
    }

    return -1;
}

function looksLikeName(hello: Buffer, start: number, length: number): boolean
{
    for (let i = start; i < start + length; i += 1)
    {
        const byte = hello[i] ?? 0;
        const letter = (byte >= 0x61 && byte <= 0x7a) || (byte >= 0x41 && byte <= 0x5a);
        const digit = byte >= 0x30 && byte <= 0x39;

        if (!letter && !digit && byte !== 0x2e && byte !== 0x2d)
        {
            return false;
        }
    }

    return true;
}
