import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { operativeInputSchema } from '@bowson/shared';
import { resolveRole } from '../auth.js';
import { db, unwrap } from '../supabase.js';
import { PARSE_FAILED, parse, parseId } from '../lib/validate.js';

/** Login PINs are only visible to managers/admins. */
async function stripPins<T extends { pin?: unknown }>(req: FastifyRequest, rows: T[]): Promise<T[]> {
  const role = await resolveRole(req);
  if (role === 'admin' || role === 'manager') return rows;
  return rows.map((r) => ({ ...r, pin: null }));
}

export const operativeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const rows = unwrap(
      await db.from('operatives').select('*').is('deletedAt', null).order('name', { ascending: true }),
    ) as { pin?: unknown }[];
    return stripPins(req, rows);
  });

  app.get('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('operatives').select('*').eq('id', id).is('deletedAt', null).maybeSingle(),
    );
    if (!row) return reply.notFound('Operative not found');
    return (await stripPins(req, [row as { pin?: unknown }]))[0];
  });

  app.post('/', async (req, reply) => {
    const data = parse(operativeInputSchema, req.body, reply);
    if (data === PARSE_FAILED) return;
    const row = unwrap(await db.from('operatives').insert(data).select().single());
    return reply.status(201).send(row);
  });

  app.patch('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const data = parse(operativeInputSchema.partial(), req.body, reply);
    if (data === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('operatives').update(data).eq('id', id).is('deletedAt', null).select().maybeSingle(),
    );
    if (!row) return reply.notFound('Operative not found');
    return row;
  });

  app.delete('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('operatives').update({ deletedAt: new Date().toISOString() })
        .eq('id', id).is('deletedAt', null).select().maybeSingle(),
    );
    if (!row) return reply.notFound('Operative not found');
    return reply.status(204).send();
  });
};
