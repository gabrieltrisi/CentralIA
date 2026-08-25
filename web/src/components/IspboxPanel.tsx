'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/lib/ui/toast';
import { ActionButton } from './ActionButton';
import { IspboxSnapshotView } from './IspboxSnapshotView';
import { IspboxSnapshot } from '@/lib/api/types';

/**
 * Seção ISPBOX no painel da conversa. Carrega o snapshot sob demanda e expõe
 * ações guardadas (PIX/PDF para FINANCIAL/MANAGER; OS para SUPPORT/MANAGER).
 * O backend aplica as flags de segurança; o front respeita o papel.
 */
export function IspboxPanel({ conversationId }: { conversationId: string }) {
  const { request, hasRole } = useAuth();
  const toast = useToast();
  const [snapshot, setSnapshot] = useState<IspboxSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const canPay = hasRole('MANAGER', 'FINANCIAL');
  const canOs = hasRole('MANAGER', 'SUPPORT');

  const firstCharge = snapshot?.charges ? [...snapshot.charges.overdue, ...snapshot.charges.open][0] : undefined;

  async function load() {
    setLoading(true);
    try {
      setSnapshot(await request<IspboxSnapshot>(`/conversations/${conversationId}/ispbox`));
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha ao carregar ISPBOX', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function action(kind: 'pix' | 'pdf' | 'os') {
    setBusy(kind);
    try {
      const body = kind === 'os' ? undefined : JSON.stringify({ chargeId: firstCharge?.id });
      const res = await request<{ blocked?: boolean; reason?: string; simulated?: boolean; ticketId?: string }>(
        `/conversations/${conversationId}/ispbox/${kind}`,
        { method: 'POST', body },
      );
      if (res.blocked) {
        toast.push(`Bloqueado: ${res.reason ?? 'ação não permitida'}`, 'info');
      } else if (kind === 'os') {
        toast.push(`OS solicitada${res.simulated ? ' (simulado)' : ''} · ticket ${res.ticketId?.slice(0, 8)}`, 'success');
      } else {
        toast.push(`${kind.toUpperCase()} gerado${res.simulated ? ' (simulado)' : ''}`, 'success');
      }
      load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha na ação', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel-section">
      <h4>ISPBOX</h4>
      {!snapshot ? (
        <ActionButton small disabled={loading} onClick={load}>{loading ? 'Carregando…' : 'Carregar ISPBOX'}</ActionButton>
      ) : (
        <>
          <IspboxSnapshotView snapshot={snapshot} />
          <div className="panel-actions mt-12">
            <ActionButton small disabled={loading} onClick={load}>Atualizar ISPBOX</ActionButton>
            {snapshot.available ? (
              <div className="row-actions">
                {canPay ? (
                  <>
                    <ActionButton small disabled={!firstCharge || busy === 'pix'} onClick={() => action('pix')}>Gerar PIX</ActionButton>
                    <ActionButton small disabled={!firstCharge || busy === 'pdf'} onClick={() => action('pdf')}>Gerar PDF</ActionButton>
                  </>
                ) : null}
                {canOs ? (
                  <ActionButton small variant="primary" disabled={busy === 'os'} onClick={() => action('os')}>Abrir OS</ActionButton>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
