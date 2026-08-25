'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiFetch, loginRequest } from '../api/client';
import {
  clearSession,
  getUser,
  setSession,
  SessionUser,
} from './storage';

type AuthStatus = 'loading' | 'authenticated' | 'guest';

interface AuthContextValue {
  user: SessionUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  request: <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    const stored = getUser();
    setUser(stored);
    setStatus(stored ? 'authenticated' : 'guest');
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginRequest(email, password);
    setSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    });
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      /* best-effort */
    }
    clearSession();
    setUser(null);
    setStatus('guest');
    router.replace('/login');
  }, [router]);

  /** Requisição autenticada com tratamento de sessão expirada. */
  const request = useCallback(
    async <T = unknown,>(path: string, init?: RequestInit): Promise<T> => {
      try {
        return await apiFetch<T>(path, init);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          setUser(null);
          setStatus('guest');
          router.replace('/login');
        }
        throw err;
      }
    },
    [router],
  );

  const hasRole = useCallback(
    (...roles: string[]) => !!user && (user.role === 'ADMIN' || roles.includes(user.role)),
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, status, login, logout, request, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
