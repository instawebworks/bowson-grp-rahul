import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { apiClient } from './api';

/**
 * PIN-based auth (ported from login_part.html's unified login).
 * The manager signs in with the manager PIN (changeable in Settings);
 * operatives sign in with their own manager-set PIN. The API returns a
 * signed token which every request carries.
 */

/** Whether the app requires login. Off by default — flip VITE_REQUIRE_AUTH=true. */
const REQUIRED = import.meta.env.VITE_REQUIRE_AUTH === 'true';

const STORAGE_KEY = 'grp_auth_v1';

export interface AuthUser {
  role: 'manager' | 'operative';
  name: string;
  operativeId: number | null;
}

interface Stored {
  token: string;
  user: AuthUser;
}

export function storedToken(): string | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as Stored).token : null;
  } catch {
    return null;
  }
}

function storedUser(): AuthUser | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as Stored).user : null;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  required: boolean;
  role: 'manager' | 'operative' | null;
  /** Whether the user may perform manager actions (true when auth is off). */
  canManage: boolean;
  /** operativeId=null signs in as the manager. */
  signIn: (operativeId: number | null, pin: string) => Promise<{ error?: string }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  required: REQUIRED,
  role: null,
  canManage: true,
  signIn: async () => ({ error: 'not ready' }),
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => storedUser());

  const value = useMemo<AuthContextValue>(() => {
    const signIn = async (operativeId: number | null, pin: string) => {
      try {
        const res = await apiClient.post<Stored>('/api/auth/login', { operativeId, pin });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
        setUser(res.user);
        return {};
      } catch (e) {
        return { error: (e as Error).message };
      }
    };
    const signOut = () => {
      localStorage.removeItem(STORAGE_KEY);
      setUser(null);
    };
    const role = user?.role ?? null;
    return {
      user,
      required: REQUIRED,
      role,
      canManage: !REQUIRED || role === 'manager',
      signIn,
      signOut,
    };
  }, [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
