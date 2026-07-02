import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { STAGE_HRS_REMAINING } from '@bowson/shared';
import { db, unwrap } from '../supabase.js';
import { PARSE_FAILED, parse } from '../lib/validate.js';

const DEFAULT_MANAGER_PIN = '1234';

const updateSchema = z.object({
  stageWeights: z.record(z.string(), z.number().min(0).max(1)).optional(),
  managerPin: z.string().min(1).max(12).optional(),
});

/** App settings: stage completion weightings + manager PIN (key/value store). */
export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    const rows = unwrap(await db.from('settings').select('key, value')) as { key: string; value: unknown }[];
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    return {
      stageWeights: { ...STAGE_HRS_REMAINING, ...((stored.get('stageWeights') as Record<string, number>) ?? {}) },
      managerPin: (stored.get('managerPin') as string) ?? DEFAULT_MANAGER_PIN,
    };
  });

  app.put('/', async (req, reply) => {
    const body = parse(updateSchema, req.body, reply);
    if (body === PARSE_FAILED) return;

    const rows: { key: string; value: unknown }[] = [];
    if (body.stageWeights) rows.push({ key: 'stageWeights', value: body.stageWeights });
    if (body.managerPin) rows.push({ key: 'managerPin', value: body.managerPin });
    if (rows.length) {
      unwrap(await db.from('settings').upsert(rows.map((r) => ({ ...r, updatedAt: new Date().toISOString() }))).select('key'));
    }

    const all = unwrap(await db.from('settings').select('key, value')) as { key: string; value: unknown }[];
    const stored = new Map(all.map((r) => [r.key, r.value]));
    return {
      stageWeights: { ...STAGE_HRS_REMAINING, ...((stored.get('stageWeights') as Record<string, number>) ?? {}) },
      managerPin: (stored.get('managerPin') as string) ?? DEFAULT_MANAGER_PIN,
    };
  });
};
