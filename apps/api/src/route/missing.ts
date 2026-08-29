/**
 * Why a system utility gave nothing back. Three modules wrote this out separately,
 * differing only in which utility they name, which is how three copies drift into
 * three behaviours.
 */
export function reasonFor(err: unknown, utility: string): string
{
    const code = (err as NodeJS.ErrnoException).code;

    if (code === 'ENOENT')
    {
        return `The system ${utility} is not installed`;
    }

    if (code === 'ETIMEDOUT')
    {
        return `The ${utility} took too long and was stopped`;
    }

    return (err as Error).message;
}
