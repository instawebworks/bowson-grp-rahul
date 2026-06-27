import type { FastifyPluginAsync } from 'fastify';
import { customerInputSchema } from '@bowson/shared';
import { db, unwrap } from '../supabase.js';
import { PARSE_FAILED, parse, parseId } from '../lib/validate.js';

export const customerRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return unwrap(
      await db.from('customers').select('*').is('deletedAt', null).order('name', { ascending: true }),
    );
  });

  app.get('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('customers').select('*').eq('id', id).is('deletedAt', null).maybeSingle(),
    );
    if (!row) return reply.notFound('Customer not found');
    return row;
  });

  app.post('/', async (req, reply) => {
    const data = parse(customerInputSchema, req.body, reply);
    if (data === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('customers').insert({ ...data, email: data.email || null }).select().single(),
    );
    return reply.status(201).send(row);
  });

  app.patch('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const data = parse(customerInputSchema.partial(), req.body, reply);
    if (data === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('customers').update(data).eq('id', id).is('deletedAt', null).select().maybeSingle(),
    );
    if (!row) return reply.notFound('Customer not found');
    return row;
  });

  app.delete('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('customers').update({ deletedAt: new Date().toISOString() })
        .eq('id', id).is('deletedAt', null).select().maybeSingle(),
    );
    if (!row) return reply.notFound('Customer not found');
    return reply.status(204).send();
  });
};
