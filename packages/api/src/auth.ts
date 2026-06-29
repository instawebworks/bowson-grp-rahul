import { jwtVerify } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './env.js';
import { db } from './supabase.js';

export type AppRole = 'admin' | 'manager' | 'operative';

export interface AuthUser {
  id: string;
  email?: string;
  /** App role from the JWT metadata (admin | manager | operative), if present. */
  appRole?: AppRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

function readAppRole(payload: Record<string, unknown>): AppRole | undefined {
  const meta = (payload.app_metadata ?? payload.user_metadata ?? {}) as { role?: unknown };
  const r = meta.role;
  return r === 'admin' || r === 'manager' || r === 'operative' ? r : undefined;
}

/**
 * Decode & verify a Supabase-issued JWT from the Authorization header and
 * attach the user to the request. Skips verification (dev convenience) when
 * SUPABASE_JWT_SECRET is not set — this MUST be configured before deploy.
 */
export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.unauthorized('Missing bearer token');
  }
  const token = header.slice('Bearer '.length);

  if (!env.SUPABASE_JWT_SECRET) {
    req.log.warn('SUPABASE_JWT_SECRET not set — accepting token without verification (dev only)');
    return;
  }

  try {
    const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    req.user = {
      id: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email : undefined,
      appRole: readAppRole(payload as Record<string, unknown>),
    };
  } catch {
    return reply.unauthorized('Invalid token');
  }
}

/**
 * Resolve the caller's app role: JWT metadata → users table → DEFAULT_ROLE.
 * (DEFAULT_ROLE keeps the first user from being locked out before roles are set.)
 */
export async function resolveRole(req: FastifyRequest): Promise<AppRole> {
  if (req.user?.appRole) return req.user.appRole;
  if (req.user?.id) {
    const { data } = await db.from('users').select('role').eq('id', req.user.id).maybeSingle();
    const r = (data as { role?: string } | null)?.role;
    if (r === 'admin' || r === 'manager' || r === 'operative') return r;
  }
  return env.DEFAULT_ROLE;
}
