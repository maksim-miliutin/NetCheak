import type { FastifyError } from 'fastify';
import { parseTarget, type Address } from '../targets/address.ts';

// The box takes what a person has to hand, so a refusal has to say which part of it
// was the problem rather than that the whole thing was wrong.
const REFUSALS: Record<string, string> =
{
    'empty': 'Type an address to watch',
    'bad-port': 'The port has to be a whole number between 1 and 65535',
    'bad-host': 'That does not look like a host name or an address',
    'too-long': 'That name is longer than a name is allowed to be',
};

export function failure(message: string, statusCode: number): FastifyError
{
    const error = new Error(message) as FastifyError;

    error.statusCode = statusCode;

    return error;
}

export function badRequest(message: string): FastifyError
{
    return failure(message, 400);
}

/**
 * The address out of what a person typed, or a refusal naming the part that was
 * wrong. Six routes each parsed and threw the same four lines, and the one thing
 * that differed between them — what to say when the refusal has no name — is the
 * argument.
 */
export function hostFrom(typed: string | undefined, instead: string): Address
{
    const parsed = parseTarget(typed ?? '');

    if (!parsed.ok)
    {
        throw badRequest(REFUSALS[parsed.refusal] ?? instead);
    }

    return parsed.address;
}
