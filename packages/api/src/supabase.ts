import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Server-side Supabase client (service-role key → bypasses RLS).
 * This is the backend's single data access point (replaces Prisma).
 */
export const db: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Error thrown when a Supabase query returns an error. */
export class DbError extends Error {
  constructor(public readonly pgError: PostgrestError) {
    super(pgError.message);
    this.name = 'DbError';
  }
}

/** Unwrap a Supabase `{ data, error }` result, throwing on error. */
export function unwrap<T>(result: { data: T; error: PostgrestError | null }): T {
  if (result.error) throw new DbError(result.error);
  return result.data;
}
