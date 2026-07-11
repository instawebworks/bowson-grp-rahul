// Empty/unset → same-origin relative "/api/…" (Vercel single-project deploy).
// In dev, .env sets VITE_API_URL=http://localhost:4000.
const API_URL = import.meta.env.VITE_API_URL ?? '';

/** PIN-login token minted by /api/auth/login (see lib/auth.tsx). */
function authHeader(): Record<string, string> {
  try {
    const s = localStorage.getItem('grp_auth_v1');
    const token = s ? (JSON.parse(s) as { token?: string }).token : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    // Only declare a JSON body when there actually is one — Fastify rejects an
    // empty body sent with Content-Type: application/json (e.g. DELETE requests).
    ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...authHeader(),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let body: unknown = null;
    try {
      body = await res.json();
      const b = body as { message?: string; error?: string; details?: Record<string, string[]> };
      message = b.message ?? b.error ?? message;
      // Surface Zod field errors ("Invalid request body" alone is undebuggable).
      if (b.details && typeof b.details === 'object') {
        const fields = Object.entries(b.details)
          .map(([field, errs]) => `${field}: ${(errs ?? []).join(', ')}`)
          .join(' · ');
        if (fields) message += ` — ${fields}`;
      }
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** API error carrying the parsed response body (e.g. workflow-gate 409s). */
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export const apiClient = {
  get: <T>(path: string) => api<T>(path),
  post: <T>(path: string, body: unknown) =>
    api<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    api<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    api<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
};
