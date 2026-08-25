'use client';

import { useEffect } from 'react';

/**
 * Polling com backpressure:
 * - pausa quando a aba está inativa (e refaz fetch ao voltar o foco);
 * - usa intervalo longo quando o socket está saudável (eventos conduzem);
 * - usa intervalo curto como fallback quando o socket está offline.
 */
export function usePolling(
  reload: () => void,
  opts: { connected?: boolean; activeMs?: number; fallbackMs?: number; paused?: boolean } = {},
) {
  const { connected = false, activeMs = 30000, fallbackMs = 5000, paused = false } = opts;
  const interval = connected ? activeMs : fallbackMs;

  useEffect(() => {
    if (paused) return;
    const tick = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') reload();
    };
    const t = setInterval(tick, interval);
    const onVis = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reload, interval, paused]);
}
