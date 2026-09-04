import type { Tongue } from '../words';

/**
 * The database writes datetime('now'), which is Greenwich. Read as it stands, a check
 * run at nine in the evening in Moscow reads as six, and the person is looking at a
 * history three hours behind the one they lived through.
 */
export function readStamp(stored: string): Date | null
{
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(stored);

    if (match === null)
    {
        return null;
    }

    const [, year, month, day, hour, minute, second] = match;

    return new Date(Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second ?? '0'),
    ));
}

/** Day before month, as everything else written in Russian does it. */
export function showStamp(stored: string, tongue: Tongue): string
{
    const when = readStamp(stored);

    if (when === null)
    {
        return stored;
    }

    const day = two(when.getDate());
    const month = two(when.getMonth() + 1);
    const clock = `${two(when.getHours())}:${two(when.getMinutes())}`;

    if (tongue === 'ru')
    {
        return `${day}.${month}.${when.getFullYear()} ${clock}`;
    }

    return `${when.getFullYear()}-${month}-${day} ${clock}`;
}

function two(value: number): string
{
    return String(value).padStart(2, '0');
}
