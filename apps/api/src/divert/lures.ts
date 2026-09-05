/**
 * The names a copy can carry. A rare name is one somebody had to decide about; a
 * name everybody reaches for a hundred times a day is one nobody decides about.
 */

export interface Lure
{
    name: string;
    because: string;
}

// State services first: a filter objecting to those has broken the country it runs
// in, so nobody writes one.
export const LURES: Lure[] =
[
    { name: 'www.gosuslugi.ru', because: 'the state service everyone must reach' },
    { name: 'vk.com', because: 'the network half the country opens daily' },
    { name: 'mail.ru', because: 'mail, and mail is never the thing blocked' },
    { name: 'yandex.ru', because: 'the search everything else is reached through' },
    { name: 'www.microsoft.com', because: 'where the machine itself goes for updates' },
    { name: 'www.google.com', because: 'the one every filter has already decided about' },
];

export function lureNames(): string[]
{
    return LURES.map((one) => one.name);
}

/** A copy carrying one of these is one this program made. */
export function isLure(name: string): boolean
{
    return LURES.some((one) => one.name === name);
}
