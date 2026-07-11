import type { FastifyPluginAsync } from 'fastify';
import { SignJWT } from 'jose';
import { z } from 'zod';
import { env } from '../env.js';
import { db, unwrap } from '../supabase.js';
import { PARSE_FAILED, parse } from '../lib/validate.js';

/**
 * PIN-based login (ported from login_part.html's unified login):
 * the login screen shows every operative by name plus a Manager button;
 * whoever is selected types their PIN. No email/password accounts.
 *
 * These routes are PUBLIC (exempted from the auth gate in index.ts) — the
 * screen needs the operative names before anyone is signed in.
 */

const DEFAULT_PIN = '1234';
const TOKEN_TTL = '30d'; // shop terminals stay signed in

const loginSchema = z.object({
  /** Operative id, or null/absent for the manager login. */
  operativeId: z.number().int().positive().nullish(),
  pin: z.string().min(1).max(12),
});

async function storedManagerPin(): Promise<string> {
  const row = unwrap(
    await db.from('settings').select('value').eq('key', 'managerPin').maybeSingle(),
  ) as { value: unknown } | null;
  return row?.value != null && String(row.value) !== '' ? String(row.value) : DEFAULT_PIN;
}

function signingSecret(): Uint8Array {
  return new TextEncoder().encode(env.SUPABASE_JWT_SECRET || 'insecure-dev-secret');
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  /** Names for the "Who are you?" grid — public, minimal fields only. */
  app.get('/operatives', async () => {
    const ops = unwrap(
      await db.from('operatives').select('id, name').is('deletedAt', null).order('name'),
    ) as { id: number; name: string }[];
    const open = unwrap(
      await db.from('time_sessions').select('operativeId').is('end', null),
    ) as { operativeId: number }[];
    const onShift = new Set(open.map((s) => s.operativeId));
    return ops.map((o) => ({ id: o.id, name: o.name, onShift: onShift.has(o.id) }));
  });

  app.post('/login', async (req, reply) => {
    const data = parse(loginSchema, req.body, reply);
    if (data === PARSE_FAILED) return;

    let user: { role: 'manager' | 'operative'; name: string; operativeId: number | null };

    if (data.operativeId == null) {
      // Manager — PIN lives in settings (changeable in Operatives & Settings).
      if (data.pin !== (await storedManagerPin())) return reply.unauthorized('Incorrect PIN');
      user = { role: 'manager', name: 'Manager', operativeId: null };
    } else {
      const op = unwrap(
        await db.from('operatives').select('id, name, pin')
          .eq('id', data.operativeId).is('deletedAt', null).maybeSingle(),
      ) as { id: number; name: string; pin: string | null } | null;
      if (!op) return reply.unauthorized('Unknown operative');
      if (data.pin !== (op.pin ?? DEFAULT_PIN)) return reply.unauthorized('Incorrect PIN');
      user = { role: 'operative', name: op.name, operativeId: op.id };
    }

    // Same shape authenticate()/resolveRole() already verify (HS256 + app_metadata.role).
    const token = await new SignJWT({
      name: user.name,
      operativeId: user.operativeId,
      app_metadata: { role: user.role },
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.role === 'manager' ? 'manager' : `operative:${user.operativeId}`)
      .setIssuedAt()
      .setExpirationTime(TOKEN_TTL)
      .sign(signingSecret());

    return { token, user };
  });
};
