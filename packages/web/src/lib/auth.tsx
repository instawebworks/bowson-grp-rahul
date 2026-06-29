import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Whether the app requires login. Off by default — flip VITE_REQUIRE_AUTH=true. */
const REQUIRED = import.meta.env.VITE_REQUIRE_AUTH === 'true';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  required: boolean;
  configured: boolean;
  role: string | null;
  /** Whether the user may perform manager/admin actions (true when auth is off). */
  canManage: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  required: REQUIRED,
  configured: !!supabase,
  role: null,
  canManage: true,
  signIn: async () => ({ error: 'not configured' }),
  signOut: async () => {},
});

function roleOf(session: Session | null): string | null {
  if (!session) return null;
  const u = session.user as { app_metadata?: { role?: string }; user_metadata?: { role?: string } };
  return u.app_metadata?.role ?? u.user_metadata?.role ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase is not configured.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
  };

  const role = roleOf(session);
  // When auth is off, or the role is unknown (defaults to admin on the server), allow manage.
  const canManage = !REQUIRED || !role || role === 'admin' || role === 'manager';

  return (
    <AuthContext.Provider
      value={{ session, loading, required: REQUIRED, configured: !!supabase, role, canManage, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
