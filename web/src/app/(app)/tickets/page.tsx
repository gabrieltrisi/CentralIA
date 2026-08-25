'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { useRealtimeEvents } from '@/lib/realtime/use-realtime-events';
import { usePolling } from '@/lib/realtime/use-polling';
import { PageHeader } from '@/components/PageHeader';
import { ActionButton } from '@/components/ActionButton';
import { DataTable, Column } from '@/components/DataTable';
import { Pager } from '@/components/Pager';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState, ErrorState } from '@/components/states';
import { Paginated, Ticket } from '@/lib/api/types';

const STATUSES = ['', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const TYPES = ['', 'SUPPORT', 'COMMERCIAL', 'FINANCIAL'];

export default function TicketsPage() {
  const { request } = useAuth();
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (type) qs.set('type', type);
  if (search.trim()) qs.set('search', search.trim());
  qs.set('page', String(page));
  qs.set('limit', '20');

  const { data, loading, error, reload } = useQuery(
    () => request<Paginated<Ticket>>(`/tickets?${qs}`),
    [request, status, type, search, page],
  );

  const { connected } = useRealtimeEvents({ onTicketUpdated: () => reload() });
  usePolling(reload, { connected });

  const rows = data?.data ?? [];

  const columns: Column<Ticket>[] = [
    { header: 'Assunto', cell: (t) => <Link className="link-cell" href={`/tickets/${t.id}`}>{t.summary ?? t.id.slice(0, 8)}</Link> },
    { header: 'Tipo', cell: (t) => <StatusBadge value={t.type} friendly /> },
    { header: 'Status', cell: (t) => <StatusBadge value={t.status} friendly /> },
    { header: 'Cliente', cell: (t) => t.customer?.name ?? '—' },
    { header: 'OS', cell: (t) => t.workOrders?.map((w) => w.ispboxOsId ?? w.status).join(', ') || '—' },
    { header: 'Criado', cell: (t) => new Date(t.createdAt).toLocaleString('pt-BR') },
    { header: '', cell: (t) => <Link className="btn btn--sm" href={`/tickets/${t.id}`}>Abrir</Link> },
  ];

  return (
    <div>
      <PageHeader
        title="Tickets"
        subtitle="Chamados de suporte e ordens de serviço"
        actions={<ActionButton onClick={() => reload()}>Atualizar</ActionButton>}
      />
      <div className="toolbar">
        <div className="field">
          <label htmlFor="tk-status">Status</label>
          <select id="tk-status" className="select" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s || 'Todos'}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tk-type">Tipo</label>
          <select id="tk-type" className="select" value={type} onChange={(e) => { setPage(1); setType(e.target.value); }}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t || 'Todos'}</option>
            ))}
          </select>
        </div>
        <div className="field field--wide">
          <label htmlFor="tk-search">Buscar</label>
          <input id="tk-search" className="input" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Assunto ou cliente…" />
        </div>
      </div>

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <DataTable columns={columns} rows={rows} emptyLabel="Nenhum ticket." />
          <Pager page={data?.page ?? 1} limit={data?.limit ?? 20} total={data?.total ?? 0} onPage={setPage} unit="tickets" />
        </>
      )}
    </div>
  );
}
