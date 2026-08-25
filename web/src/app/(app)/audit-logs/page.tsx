'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { PageHeader } from '@/components/PageHeader';
import { ActionButton } from '@/components/ActionButton';
import { DataTable, Column } from '@/components/DataTable';
import { LoadingState, ErrorState } from '@/components/states';
import { AuditLog, Paginated } from '@/lib/api/types';

export default function AuditLogsPage() {
  const { request, hasRole } = useAuth();
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  const allowed = hasRole('MANAGER'); // ADMIN passa em hasRole

  const qs = new URLSearchParams();
  if (action) qs.set('action', action);
  if (entityType) qs.set('entityType', entityType);
  if (startDate) qs.set('startDate', startDate);
  if (endDate) qs.set('endDate', endDate);
  qs.set('page', String(page));
  qs.set('limit', '20');

  const { data, loading, error, reload } = useQuery(
    () => request<Paginated<AuditLog>>(`/audit-logs?${qs}`),
    [request, action, entityType, startDate, endDate, page, allowed],
  );

  if (!allowed) {
    return (
      <div>
        <h1 className="page-title">Auditoria</h1>
        <ErrorState error={{ name: 'Forbidden', message: 'Apenas ADMIN e MANAGER.' }} />
      </div>
    );
  }

  const columns: Column<AuditLog>[] = [
    { header: 'Quando', cell: (a) => new Date(a.createdAt).toLocaleString('pt-BR') },
    { header: 'Ação', cell: (a) => a.action },
    { header: 'Ator', cell: (a) => `${a.actorType}${a.actorId ? ` (${a.actorId.slice(0, 8)})` : ''}` },
    { header: 'Entidade', cell: (a) => (a.entityType ? `${a.entityType}:${(a.entityId ?? '').slice(0, 8)}` : '—') },
    { header: 'IP', cell: (a) => a.ip ?? '—' },
  ];

  return (
    <div>
      <PageHeader
        title="Auditoria"
        subtitle="Trilha de eventos sensíveis (acesso, handoff, envio, mídia)"
        actions={<ActionButton onClick={() => reload()}>Atualizar</ActionButton>}
      />
      <div className="toolbar">
        <div className="field">
          <label htmlFor="au-action">Ação</label>
          <input id="au-action" className="input" value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }} placeholder="ex.: attachment.download" />
        </div>
        <div className="field">
          <label htmlFor="au-entity">Entidade</label>
          <input id="au-entity" className="input" value={entityType} onChange={(e) => { setPage(1); setEntityType(e.target.value); }} placeholder="ex.: conversation" />
        </div>
        <div className="field">
          <label htmlFor="au-start">Início</label>
          <input id="au-start" className="input" type="date" value={startDate} onChange={(e) => { setPage(1); setStartDate(e.target.value); }} />
        </div>
        <div className="field">
          <label htmlFor="au-end">Fim</label>
          <input id="au-end" className="input" type="date" value={endDate} onChange={(e) => { setPage(1); setEndDate(e.target.value); }} />
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <DataTable columns={columns} rows={data?.data ?? []} emptyLabel="Sem eventos." />
          <div className="toolbar toolbar--end mt-12">
            <span className="muted">
              {data?.total ?? 0} eventos · página {data?.page ?? 1}
            </span>
            <ActionButton small disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </ActionButton>
            <ActionButton small disabled={!!data && page * data.limit >= data.total} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </ActionButton>
          </div>
        </>
      )}
    </div>
  );
}
