import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db, unwrap } from '../supabase.js';
import { PARSE_FAILED, parse, parseId } from '../lib/validate.js';

/**
 * Finish types (phase 2, client point 9): PLAIN / THEMED / … with the
 * Laminating and Finishing hour multipliers applied at point of order.
 * Values are editable in Operatives & Settings (seeded defaults await the
 * client's confirmation against their THEME WORKINGS sheet).
 */

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  lamMult: z.number().nonnegative().optional(),
  finMult: z.number().nonnegative().optional(),
});

export const finishTypeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return unwrap(
      await db.from('finish_types').select('*').order('sort', { ascending: true }),
    );
  });

  app.patch('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const data = parse(updateSchema, req.body, reply);
    if (data === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('finish_types').update(data).eq('id', id).select().maybeSingle(),
    );
    if (!row) return reply.notFound('Finish type not found');
    return row;
  });
};
