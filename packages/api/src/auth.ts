import { jwtVerify } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './env.js';

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
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
      role: typeof payload.role === 'string' ? payload.role : undefined,
    };
  } catch {
    return reply.unauthorized('Invalid token');
  }
}
