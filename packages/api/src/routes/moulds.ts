import type { FastifyPluginAsync } from 'fastify';
import { mouldInputSchema } from '@bowson/shared';
import { db, unwrap } from '../supabase.js';
import { PARSE_FAILED, parse, parseId } from '../lib/validate.js';

export const mouldRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return unwrap(
      await db.from('moulds').select('*').is('deletedAt', null).order('ref', { ascending: true }),
    );
  });

  app.get('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('moulds').select('*, tickets:tickets(*)').eq('id', id).is('deletedAt', null).maybeSingle(),
    );
    if (!row) return reply.notFound('Mould not found');
    return row;
  });

  app.post('/', async (req, reply) => {
    const data = parse(mouldInputSchema, req.body, reply);
    if (data === PARSE_FAILED) return;
    const dup = unwrap(await db.from('moulds').select('id').eq('ref', data.ref).maybeSingle());
    if (dup) return reply.conflict(`Mould ref "${data.ref}" already exists`);
    const row = unwrap(await db.from('moulds').insert(data).select().single());
    return reply.status(201).send(row);
  });

  app.patch('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const data = parse(mouldInputSchema.partial(), req.body, reply);
    if (data === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('moulds').update(data).eq('id', id).is('deletedAt', null).select().maybeSingle(),
    );
    if (!row) return reply.notFound('Mould not found');
    return row;
  });

  app.delete('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('moulds').update({ deletedAt: new Date().toISOString() })
        .eq('id', id).is('deletedAt', null).select().maybeSingle(),
    );
    if (!row) return reply.notFound('Mould not found');
    return reply.status(204).send();
  });
};
