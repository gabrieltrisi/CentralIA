'use client';

import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  updateTokens,
} from '../auth/storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function withAuth(init: RequestInit | undefined, token: string | null): RequestInit {
  const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  return {
    ...init,
    headers: {
      // Não definir Content-Type em multipart (o browser define o boundary).
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  };
}

let refreshing: Promise<boolean> | null = null;

/** Renova os tokens via /auth/refresh (coalescido). */
async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      updateTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return (body?.message && String(body.message)) || `Erro ${res.status}`;
  } catch {
    return `Erro ${res.status}`;
  }
}

/** Requisição autenticada com Bearer automático e refresh em 401. */
export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res = await fetch(`${API_URL}${path}`, withAuth(init, getAccessToken()));

  if (res.status === 401) {
    const ok = await tryRefresh();
    if (!ok) {
      clearSession();
      throw new ApiError(401, 'Sessão expirada');
    }
    res = await fetch(`${API_URL}${path}`, withAuth(init, getAccessToken()));
  }

  if (!res.ok) {
    throw new ApiError(res.status, await readError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface UploadHandle {
  promise: Promise<unknown>;
  cancel: () => void;
}

/**
 * Upload multipart com progresso e cancelamento (XHR). Reanexa o Bearer,
 * tenta refresh uma vez em 401 e expõe `cancel()` para abortar.
 */
export function uploadWithProgress(
  path: string,
  form: FormData,
  onProgress?: (pct: number) => void,
): UploadHandle {
  let xhr: XMLHttpRequest | null = null;
  let cancelled = false;

  const run = (token: string | null, allowRefresh: boolean): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (cancelled) return reject(new ApiError(0, 'Cancelado'));
      const req = new XMLHttpRequest();
      xhr = req;
      req.open('POST', `${API_URL}${path}`);
      if (token) req.setRequestHeader('Authorization', `Bearer ${token}`);
      // Não definir Content-Type: o browser define o boundary do multipart.

      req.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      req.onload = async () => {
        if (req.status === 401 && allowRefresh) {
          const ok = await tryRefresh();
          if (!ok) {
            clearSession();
            return reject(new ApiError(401, 'Sessão expirada'));
          }
          return resolve(run(getAccessToken(), false));
        }
        if (req.status >= 200 && req.status < 300) {
          try {
            resolve(req.responseText ? JSON.parse(req.responseText) : undefined);
          } catch {
            resolve(undefined);
          }
        } else {
          let msg = `Erro ${req.status}`;
          try {
            msg = JSON.parse(req.responseText)?.message ?? msg;
          } catch {
            /* keep default */
          }
          reject(new ApiError(req.status, Array.isArray(msg) ? msg.join(', ') : String(msg)));
        }
      };
      req.onerror = () => reject(new ApiError(0, 'Falha de rede'));
      req.onabort = () => reject(new ApiError(0, 'Cancelado'));
      req.send(form);
    });

  return {
    promise: run(getAccessToken(), true),
    cancel: () => {
      cancelled = true;
      xhr?.abort();
    },
  };
}

/** Login (sem token). */
export async function loginRequest(email: string, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return res.json();
}

export { API_URL };
