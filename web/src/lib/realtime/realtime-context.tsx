'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '../auth/storage';
import { API_URL, apiFetch } from '../api/client';

export interface RealtimeHandlers {
  onMessageCreated?: (p: { conversationId: string; messageId: string; role: string }) => void;
  onConversationUpdated?: (p: { conversationId: string }) => void;
  onHumanQueueUpdated?: (p: { id?: string; conversationId?: string }) => void;
  onTicketUpdated?: (p: { ticketId: string; conversationId?: string; status?: string }) => void;
  onPresenceUpdated?: (p: { userId: string; status: string }) => void;
}

interface RealtimeContextValue {
  connected: boolean;
  presence: Record<string, string>;
  subscribe: (h: RealtimeHandlers) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const DEDUPE_TTL_MS = 4000;
const HEARTBEAT_MS = 45000;

/**
 * Conexão Socket.IO única do painel (uma por sessão). Conecta em /realtime com
 * JWT, mantém presença, reconecta sozinho e despacha eventos para os inscritos.
 * Deduplica por messageId/ticketId. O polling das páginas continua como fallback.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<Record<string, string>>({});
  const subscribers = useRef<Set<RealtimeHandlers>>(new Set());
  const seen = useRef<Map<string, number>>(new Map());

  const subscribe = useCallback((h: RealtimeHandlers) => {
    subscribers.current.add(h);
    return () => subscribers.current.delete(h);
  }, []);

  const fresh = useCallback((key: string): boolean => {
    const now = Date.now();
    for (const [k, t] of seen.current) if (now - t > DEDUPE_TTL_MS) seen.current.delete(k);
    if (seen.current.has(key)) return false;
    seen.current.set(key, now);
    return true;
  }, []);

  const dispatch = useCallback(<K extends keyof RealtimeHandlers>(fn: K, payload: Parameters<NonNullable<RealtimeHandlers[K]>>[0]) => {
    subscribers.current.forEach((h) => {
      const cb = h[fn] as ((p: unknown) => void) | undefined;
      cb?.(payload);
    });
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    // Carrega presença inicial.
    apiFetch<{ userId: string; status: string }[]>('/presence')
      .then((list) => setPresence(Object.fromEntries(list.map((p) => [p.userId, p.status]))))
      .catch(() => {});

    const socket: Socket = io(`${API_URL}/realtime`, {
      transports: ['websocket', 'polling'],
      // BUG-02: `auth` como função é reavaliada a cada (re)conexão, então após o
      // refresh do access token o socket reconecta com o token NOVO (antes ficava
      // preso ao token inicial e o realtime morria silenciosamente após a expiração).
      auth: (cb) => cb({ token: getAccessToken() ?? token }),
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 8000,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('message.created', (p: { conversationId: string; messageId: string; role: string }) => {
      if (!p?.messageId || !fresh(`m:${p.messageId}`)) return;
      dispatch('onMessageCreated', p);
    });
    socket.on('conversation.updated', (p: { conversationId: string }) => dispatch('onConversationUpdated', p));
    socket.on('human_queue.updated', (p: { id?: string; conversationId?: string }) => dispatch('onHumanQueueUpdated', p));
    socket.on('ticket.updated', (p: { ticketId: string; conversationId?: string; status?: string }) => {
      if (p?.ticketId && !fresh(`t:${p.ticketId}:${p.status ?? ''}`)) return;
      dispatch('onTicketUpdated', p);
    });
    socket.on('user.presence.updated', (p: { userId: string; status: string }) => {
      setPresence((prev) => ({ ...prev, [p.userId]: p.status }));
      dispatch('onPresenceUpdated', p);
    });

    // Heartbeat de presença (mantém ONLINE/AWAY fresco mesmo sem reconexão).
    const beat = () => {
      const status = document.visibilityState === 'visible' ? 'ONLINE' : 'AWAY';
      apiFetch('/presence/heartbeat', { method: 'POST', body: JSON.stringify({ status }) }).catch(() => {});
    };
    beat();
    const hb = setInterval(beat, HEARTBEAT_MS);
    const onVis = () => beat();
    document.addEventListener('visibilitychange', onVis);

    return () => {
      clearInterval(hb);
      document.removeEventListener('visibilitychange', onVis);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [dispatch, fresh]);

  return (
    <RealtimeContext.Provider value={{ connected, presence, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  // Tolerante a ausência de provider (degrada para “desconectado”, mantém polling).
  return ctx ?? { connected: false, presence: {}, subscribe: () => () => {} };
}
