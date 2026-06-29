import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

// Load the root .env (monorepo shares a single env file).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  // When true, all /api routes require a valid Supabase JWT. Off by default so
  // the app runs without auth until users + JWT secret are configured.
  AUTH_REQUIRED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // App role assumed when a logged-in user has no explicit role (in their JWT
  // app_metadata or the users table). Keeps the first user from being locked out.
  DEFAULT_ROLE: z.enum(['admin', 'manager', 'operative']).default('admin'),
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. Copy .env.example to .env and fill it in.');
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim());
