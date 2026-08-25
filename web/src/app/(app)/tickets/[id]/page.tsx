'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { useToast } from '@/lib/ui/toast';
import { PageHeader } from '@/components/PageHeader';
import { ActionButton } from '@/components/ActionButton';
import { SectionCard } from '@/components/SectionCard';
import { Icon } from '@/components/Icon';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState, ErrorState } from '@/components/states';
import { TicketDetail } from '@/lib/api/types';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { request, hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('MANAGER', 'AGENT', 'SUPPORT');
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useQuery(
    () => request<TicketDetail>(`/tickets/${id}`),
    [request, id],
  );

  async function setStatus(status: string) {
    setBusy(true);
    try {
      await request(`/tickets/${id}/status/${status}`, { method: 'PATCH' });
      toast.push('Status atualizado', 'success');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha ao atualizar', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;

  const t = data;

  return (
    <div>
      <PageHeader
        title={`Ticket · ${t.summary ?? t.id.slice(0, 8)}`}
        subtitle="Detalhe do chamado / ordem de serviço"
        actions={
          <div className="row-actions">
            {t.conversationId ? (
              <Link className="btn btn--primary btn--sm" href={`/conversations?c=${t.conversationId}`}>Abrir conversa</Link>
            ) : null}
            <ActionButton small variant="ghost" onClick={() => router.push('/tickets')}>← Voltar</ActionButton>
          </div>
        }
      />

      <div className="detail-grid">
        <SectionCard title="Dados do ticket" icon={<Icon name="ticket" className="" size={16} />}>
          <div className="kv"><span>Tipo</span><span><StatusBadge value={t.type} friendly /></span></div>
          <div className="kv"><span>Status</span><span><StatusBadge value={t.status} friendly /></span></div>
          {t.priority ? <div className="kv"><span>Prioridade</span><span>{t.priority}</span></div> : null}
          <div className="kv"><span>Resumo</span><span className="kv__wrap">{t.summary ?? '—'}</span></div>
          <div className="kv"><span>Criado</span><span>{new Date(t.createdAt).toLocaleString('pt-BR')}</span></div>
          {t.updatedAt ? <div className="kv"><span>Atualizado</span><span>{new Date(t.updatedAt).toLocaleString('pt-BR')}</span></div> : null}
        </SectionCard>

        <SectionCard title="Cliente" icon={<Icon name="users" className="" size={16} />}>
          {t.customer ? (
            <>
              <div className="kv"><span>Nome</span><span>{t.customer.name}</span></div>
              <div className="kv"><span>CPF/CNPJ</span><span>{t.customer.cpfCnpj ?? '—'}</span></div>
              <div className="kv"><span>Telefone</span><span>{t.customer.phone ?? '—'}</span></div>
              <div className="kv"><span>E-mail</span><span className="kv__wrap">{t.customer.email ?? '—'}</span></div>
              {t.customerId ? <Link className="btn btn--sm mt-12" href={`/customers/${t.customerId}`}>Ver cliente →</Link> : null}
            </>
          ) : (
            <p className="muted">Sem cliente vinculado.</p>
          )}
        </SectionCard>

        <SectionCard title="OS ISPBOX" icon={<Icon name="ispbox" className="" size={16} />}>
          {t.workOrders && t.workOrders.length > 0 ? (
            t.workOrders.map((w) => (
              <div className="kv" key={w.id}>
                <span>{w.ispboxOsId ?? w.id.slice(0, 8)}</span>
                <span><StatusBadge value={w.status} friendly /></span>
              </div>
            ))
          ) : (
            <p className="muted">Nenhuma OS associada (sandbox/simulado).</p>
          )}
        </SectionCard>

        <SectionCard title="Histórico / eventos" icon={<Icon name="audit" className="" size={16} />}>
          {t.events && t.events.length > 0 ? (
            <ul className="event-list">
              {t.events.map((e) => (
                <li key={e.id}>
                  <span className="event-list__dot" />
                  <div>
                    <strong>{e.event}</strong>
                    <small>{new Date(e.createdAt).toLocaleString('pt-BR')}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Sem eventos registrados.</p>
          )}
        </SectionCard>
      </div>

      {canWrite ? (
        <SectionCard title="Ações" icon={<Icon name="settings" className="" size={16} />}>
          <div className="row-actions">
            {STATUSES.map((s) => (
              <ActionButton key={s} small disabled={busy || t.status === s} variant={t.status === s ? 'ghost' : 'primary'} onClick={() => setStatus(s)}>
                {s}
              </ActionButton>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
