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
import { Conversation, CustomerDetail, Paginated, Ticket } from '@/lib/api/types';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { request, hasRole } = useAuth();
  const toast = useToast();
  const canSync = hasRole('MANAGER');
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useQuery(async () => {
    const safe = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb);
    const customer = await request<CustomerDetail>(`/customers/${id}`);
    const phone = (customer.phone ?? '').replace(/\D/g, '').slice(-8);
    const [convs, tickets] = await Promise.all([
      phone ? safe(request<Paginated<Conversation>>(`/conversations?search=${phone}&limit=10`), null) : Promise.resolve(null),
      safe(request<Paginated<Ticket>>(`/tickets?search=${encodeURIComponent(customer.name)}&limit=10`), null),
    ]);
    return { customer, convs: convs?.data ?? [], tickets: tickets?.data ?? [] };
  }, [request, id]);

  async function syncIspbox() {
    if (!data?.customer.ispboxId) return;
    setBusy(true);
    try {
      await request(`/customers/sync/${data.customer.ispboxId}`, { method: 'POST' });
      toast.push('Cliente sincronizado com a ISPBOX', 'success');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha ao sincronizar', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;

  const c = data.customer;
  const firstConv = data.convs[0];

  return (
    <div>
      <PageHeader
        title={c.name}
        subtitle="Perfil do cliente"
        actions={
          <div className="row-actions">
            {firstConv ? <Link className="btn btn--primary btn--sm" href={`/conversations?c=${firstConv.id}`}>Abrir conversa</Link> : null}
            {canSync && c.ispboxId ? <ActionButton small disabled={busy} onClick={syncIspbox}>Atualizar ISPBOX</ActionButton> : null}
            <ActionButton small variant="ghost" onClick={() => router.push('/customers')}>← Voltar</ActionButton>
          </div>
        }
      />

      <div className="detail-grid">
        <SectionCard title="Dados cadastrais" icon={<Icon name="users" className="" size={16} />}>
          <div className="kv"><span>Nome</span><span>{c.name}</span></div>
          <div className="kv"><span>CPF/CNPJ</span><span>{c.cpfCnpj ?? '—'}</span></div>
          <div className="kv"><span>Telefone</span><span>{c.phone ?? '—'}</span></div>
          <div className="kv"><span>E-mail</span><span className="kv__wrap">{c.email ?? '—'}</span></div>
          <div className="kv"><span>ID ISPBOX</span><span>{c.ispboxId ?? '—'}</span></div>
        </SectionCard>

        <SectionCard title="Serviços / ISPBOX" icon={<Icon name="ispbox" className="" size={16} />}>
          {c.services && c.services.length > 0 ? (
            c.services.map((s) => (
              <div className="kv" key={s.id}>
                <span>{s.type ?? 'Serviço'} {s.ispboxServiceId ? `· ${s.ispboxServiceId}` : ''}</span>
                <span><StatusBadge value={s.status ?? '—'} friendly /></span>
              </div>
            ))
          ) : (
            <p className="muted">Nenhum serviço sincronizado.</p>
          )}
        </SectionCard>

        <SectionCard title={`Conversas (${data.convs.length})`} icon={<Icon name="chat" className="" size={16} />}>
          {data.convs.length > 0 ? (
            data.convs.map((cv) => (
              <div className="kv" key={cv.id}>
                <span><StatusBadge value={cv.status} friendly /> · {new Date(cv.lastMessageAt ?? cv.updatedAt).toLocaleDateString('pt-BR')}</span>
                <Link className="btn btn--sm" href={`/conversations?c=${cv.id}`}>Abrir</Link>
              </div>
            ))
          ) : (
            <p className="muted">Nenhuma conversa encontrada.</p>
          )}
        </SectionCard>

        <SectionCard title={`Tickets (${data.tickets.length})`} icon={<Icon name="ticket" className="" size={16} />}>
          {data.tickets.length > 0 ? (
            data.tickets.map((t) => (
              <div className="kv" key={t.id}>
                <span>{t.summary ?? t.id.slice(0, 8)} · <StatusBadge value={t.status} friendly /></span>
                <Link className="btn btn--sm" href={`/tickets/${t.id}`}>Abrir</Link>
              </div>
            ))
          ) : (
            <p className="muted">Nenhum ticket encontrado.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
