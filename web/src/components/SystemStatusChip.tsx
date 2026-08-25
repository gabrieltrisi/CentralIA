'use client';

import { useRealtime } from '@/lib/realtime/realtime-context';

/**
 * Status compacto do sistema (rodapé da sidebar): "Sistema online" via socket
 * de tempo real + indicação de modo (Sandbox/Produção) quando informado.
 */
export function SystemStatusChip({ appMode }: { appMode?: string }) {
  const { connected } = useRealtime();
  const sandbox = appMode === 'sandbox';
  return (
    <div className="sysstatus">
      <div className={`sysstatus__row ${connected ? 'is-online' : 'is-off'}`}>
        <span className="sysstatus__dot" />
        {connected ? 'Sistema online' : 'Reconectando…'}
      </div>
      {appMode ? (
        <div className={`sysstatus__mode ${sandbox ? 'is-sandbox' : 'is-prod'}`}>
          {sandbox ? 'Sandbox ativo' : 'Produção'}
        </div>
      ) : null}
    </div>
  );
}
