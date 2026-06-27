import type { FastifyReply } from 'fastify';
import { z, type ZodTypeAny } from 'zod';

/**
 * Parse data against a Zod schema. On failure, sends a 400 with the flattened
 * field errors and returns the sentinel so the caller can `return`.
 */
export const PARSE_FAILED = Symbol('parse-failed');

export function parse<T extends ZodTypeAny>(
  schema: T,
  data: unknown,
  reply: FastifyReply,
): z.infer<T> | typeof PARSE_FAILED {
  const result = schema.safeParse(data);
  if (!result.success) {
    reply.status(400).send({
      error: 'ValidationError',
      message: 'Invalid request body',
      details: result.error.flatten().fieldErrors,
    });
    return PARSE_FAILED;
  }
  return result.data;
}

/** Parse an integer route param (":id"), or send 400. */
export function parseId(
  raw: string | undefined,
  reply: FastifyReply,
): number | typeof PARSE_FAILED {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    reply.status(400).send({ error: 'ValidationError', message: 'Invalid id parameter' });
    return PARSE_FAILED;
  }
  return id;
}
