'use client';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
}

const ACCESS_KEY = 'centralia.accessToken';
const REFRESH_KEY = 'centralia.refreshToken';
const USER_KEY = 'centralia.user';

const hasWindow = () => typeof window !== 'undefined';

export function getAccessToken(): string | null {
  return hasWindow() ? window.localStorage.getItem(ACCESS_KEY) : null;
}

export function getRefreshToken(): string | null {
  return hasWindow() ? window.localStorage.getItem(REFRESH_KEY) : null;
}

export function getUser(): SessionUser | null {
  if (!hasWindow()) return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function setSession(params: {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(ACCESS_KEY, params.accessToken);
  window.localStorage.setItem(REFRESH_KEY, params.refreshToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(params.user));
}

export function updateTokens(accessToken: string, refreshToken: string): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(ACCESS_KEY, accessToken);
  window.localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearSession(): void {
  if (!hasWindow()) return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(USER_KEY);
}
