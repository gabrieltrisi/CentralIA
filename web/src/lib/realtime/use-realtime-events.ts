'use client';

import { useEffect, useRef } from 'react';
import { RealtimeHandlers, useRealtime } from './realtime-context';

export type { RealtimeHandlers } from './realtime-context';

/**
 * Inscreve handlers de eventos de tempo real na conexão Socket.IO compartilhada.
 * Retorna `{ connected }` para a página decidir reduzir/parar o polling quando
 * o socket está saudável (mantendo o polling como fallback).
 */
export function useRealtimeEvents(handlers: RealtimeHandlers): { connected: boolean } {
  const { connected, subscribe } = useRealtime();
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    // Encaminha para os handlers atuais sem recriar a inscrição a cada render.
    const unsub = subscribe({
      onMessageCreated: (p) => ref.current.onMessageCreated?.(p),
      onConversationUpdated: (p) => ref.current.onConversationUpdated?.(p),
      onHumanQueueUpdated: (p) => ref.current.onHumanQueueUpdated?.(p),
      onTicketUpdated: (p) => ref.current.onTicketUpdated?.(p),
      onPresenceUpdated: (p) => ref.current.onPresenceUpdated?.(p),
    });
    return unsub;
  }, [subscribe]);

  return { connected };
}
