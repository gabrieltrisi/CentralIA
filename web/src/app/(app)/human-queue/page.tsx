'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { useToast } from '@/lib/ui/toast';
import { useRealtimeEvents } from '@/lib/realtime/use-realtime-events';
import { usePolling } from '@/lib/realtime/use-polling';
import { PageHeader } from '@/components/PageHeader';
import { BigMetricCard } from '@/components/BigMetricCard';
import { DataTable, Column } from '@/components/DataTable';
import { Pager } from '@/components/Pager';
import { ActionButton } from '@/components/ActionButton';
import { AssigneeSelect } from '@/components/AssigneeSelect';
import { StatusBadge } from '@/components/StatusBadge';
import { HumanQueueKanban } from '@/components/HumanQueueKanban';
import { LoadingState, ErrorState } from '@/components/states';
import { HumanQueueItem, Paginated, User } from '@/lib/api/types';
import { REASON_LABEL, SLA_LABEL, typeOf } from '@/lib/human-queue/kanban';

const STATUSES = ['', 'WAITING', 'ASSIGNED', 'RESOLVED'];
const REASONS = ['', 'CLIENT_REQUEST', 'COMPLEX_SUPPORT', 'NEGOTIATION', 'API_ERROR', 'UNKNOWN_INTENT'];
const PRIORITIES = ['', 'URGENT', 'HIGH', 'NORMAL', 'LOW'];
const TYPES = ['', 'COMMERCIAL', 'SUPPORT', 'FINANCIAL'];
const TYPE_LABEL: Record<string, string> = { COMMERCIAL: 'Comercial', SUPPORT: 'Suporte', FINANCIAL: 'Financeiro' };
const POLL_MS = 5000;

const REASON_TONE: Record<string, string> = {
  CLIENT_REQUEST: 'secondary', COMPLEX_SUPPORT: 'amber', NEGOTIATION: 'primary', API_ERROR: 'red', UNKNOWN_INTENT: 'gray',
};
const PRIORITY_TONE: Record<string, string> = { URGENT: 'red', HIGH: 'amber', NORMAL: 'gray', LOW: 'gray' };

type View = 'kanban' | 'list';

function ReasonBadge({ reason }: { reason: string }) {
  return <span className={`badge badge--${REASON_TONE[reason] ?? 'gray'}`}>{REASON_LABEL[reason] ?? reason}</span>;
}
function SlaBadge({ status }: { status?: string }) {
  if (!status) return <span className="sla sla--on_time">—</span>;
  return <span className={`sla sla--${status}`}>{SLA_LABEL[status] ?? status}</span>;
}

function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

/** Busca multi-campo (nome, telefone, resumo, motivo, tipo, prioridade, status, SLA). */
function matchesSearch(q: HumanQueueItem, term: string): boolean {
  const t = typeOf(q);
  const haystack = [
    q.conversation?.customer?.name,
    q.conversation?.customer?.phone,
    q.conversation?.contact,
    q.summary,
    REASON_LABEL[q.reason] ?? q.reason,
    t?.label,
    q.priority,
    q.status,
    SLA_LABEL[q.slaStatus ?? ''] ?? q.slaStatus,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

export default function HumanQueuePage() {
  const { request, user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [view, setView] = useState<View>('kanban');
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState('');
  const [type, setType] = useState('');
  const [searchInput, setSearchInput] = useState(''); // texto digitado
  const [search, setSearch] = useState(''); // debounced (item 4)
  const [page, setPage] = useState(1);

  // Busca em tempo real com debounce de 280ms (item 4).
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 280);
    return () => clearTimeout(id);
  }, [searchInput]);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<HumanQueueItem | null>(null);

  // Preferência de visão (Kanban é a recomendada para operação diária).
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('hq-view') : null;
    if (saved === 'list' || saved === 'kanban') setView(saved);
  }, []);
  function changeView(v: View) {
    setView(v);
    if (typeof window !== 'undefined') window.localStorage.setItem('hq-view', v);
  }

  const isKanban = view === 'kanban';
  // No Kanban buscamos todos os status (as colunas representam o estado) com limite maior.
  const qs = new URLSearchParams();
  if (!isKanban && status) qs.set('status', status);
  if (!isKanban && reason) qs.set('reason', reason);
  if (priority) qs.set('priority', priority);
  qs.set('page', String(isKanban ? 1 : page));
  qs.set('limit', String(isKanban ? 100 : 20));

  // A busca é client-side (multi-campo) sobre os itens carregados, então NÃO entra no querystring.
  const { data, loading, error, reload } = useQuery(
    () => request<Paginated<HumanQueueItem>>(`/human-queue?${qs}`),
    [request, isKanban, status, reason, priority, page],
  );
  const { data: usersData } = useQuery(() => request<User[]>('/users?active=true'), [request]);
  const usersById = useMemo(() => {
    const m: Record<string, string> = {};
    (usersData ?? []).forEach((u) => { m[u.id] = u.name; });
    return m;
  }, [usersData]);

  const { connected } = useRealtimeEvents({ onHumanQueueUpdated: () => reload() });
  usePolling(reload, { connected, fallbackMs: POLL_MS });

  // Filtros client-side: tipo (intent) + busca multi-campo em tempo real (item 4).
  const total = data?.data?.length ?? 0;
  const rows = useMemo(() => {
    let r = data?.data ?? [];
    if (type) r = r.filter((q) => typeOf(q)?.key === type);
    if (search) r = r.filter((q) => matchesSearch(q, search));
    return r;
  }, [data, type, search]);

  const overdue = useMemo(() => rows.filter((r) => r.slaStatus === 'overdue').length, [rows]);
  const dueSoon = useMemo(() => rows.filter((r) => r.slaStatus === 'due_soon').length, [rows]);
  const inProgress = useMemo(() => rows.filter((r) => r.status === 'ASSIGNED' || (!!r.assignedUserId && r.status !== 'RESOLVED')).length, [rows]);
  const waiting = useMemo(() => rows.filter((r) => r.status === 'WAITING' && !r.assignedUserId).length, [rows]);
  const highPriority = useMemo(() => rows.filter((r) => (r.priority === 'URGENT' || r.priority === 'HIGH') && r.status !== 'RESOLVED').length, [rows]);
  const resolvedToday = useMemo(() => rows.filter((r) => r.status === 'RESOLVED' && isToday(r.resolvedAt)).length, [rows]);

  async function act(id: string, action: 'assign' | 'resolve' | 'reopen', uid?: string) {
    setBusy(id + action);
    try {
      const body = action === 'assign' ? JSON.stringify({ assignedUserId: uid ?? user?.id }) : undefined;
      await request(`/human-queue/${id}/${action}`, { method: 'PATCH', body });
      toast.push('Ação concluída', 'success');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha na ação', 'error');
    } finally {
      setBusy(null);
    }
  }

  function openConversation(conversationId?: string) {
    if (conversationId) router.push(`/conversations?c=${conversationId}`);
  }

  const columns: Column<HumanQueueItem>[] = [
    { header: 'Cliente', cell: (q) => q.conversation?.customer?.name ?? q.conversation?.contact ?? '—' },
    { header: 'Tipo', cell: (q) => { const t = typeOf(q); return t ? <span className={`intent-badge intent-badge--${t.key}`}>{t.label}</span> : <span className="muted">—</span>; } },
    { header: 'Motivo', cell: (q) => <ReasonBadge reason={q.reason} /> },
    { header: 'Prioridade', cell: (q) => <span className={`badge badge--${PRIORITY_TONE[q.priority ?? 'NORMAL'] ?? 'gray'}`}>{q.priority ?? 'NORMAL'}</span> },
    { header: 'SLA', cell: (q) => <SlaBadge status={q.slaStatus} /> },
    { header: '1ª resposta', cell: (q) => (q.firstResponseMinutes != null ? `${q.firstResponseMinutes} min` : '—') },
    { header: 'Vence', cell: (q) => (q.dueAt ? new Date(q.dueAt).toLocaleTimeString('pt-BR') : '—') },
    { header: 'Status', cell: (q) => <StatusBadge value={q.status} friendly /> },
    {
      header: 'Ações',
      cell: (q) => (
        <div className="row-actions">
          <ActionButton small onClick={() => setSelected(q)}>Detalhes</ActionButton>
          {q.status !== 'RESOLVED' ? (
            <ActionButton small disabled={busy === q.id + 'assign'} onClick={() => act(q.id, 'assign')}>Assumir</ActionButton>
          ) : null}
          {q.status !== 'RESOLVED' ? (
            <ActionButton small variant="primary" disabled={busy === q.id + 'resolve'} onClick={() => act(q.id, 'resolve')}>Resolver</ActionButton>
          ) : (
            <ActionButton small disabled={busy === q.id + 'reopen'} onClick={() => act(q.id, 'reopen')}>Reabrir</ActionButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Fila de Atendimento"
        subtitle="Central operacional — priorize SLA atrasado e alta prioridade."
        actions={
          <div className="view-toggle-wrap">
            <span className="view-toggle__cap">Visualização: <strong>{isKanban ? 'Kanban' : 'Lista'}</strong></span>
            <div className="view-toggle" role="tablist" aria-label="Modo de visualização">
              <button type="button" role="tab" aria-selected={isKanban ? 'true' : 'false'} className={`view-toggle__btn ${isKanban ? 'is-active' : ''}`} onClick={() => changeView('kanban')}>▦ Kanban</button>
              <button type="button" role="tab" aria-selected={!isKanban ? 'true' : 'false'} className={`view-toggle__btn ${!isKanban ? 'is-active' : ''}`} onClick={() => changeView('list')}>☰ Lista</button>
            </div>
          </div>
        }
      />

      <div className="big-grid mb-18">
        <BigMetricCard tone="red" label="Atrasados" value={overdue} icon="clock" hint="Fora do SLA" />
        <BigMetricCard tone="amber" label="Vencendo" value={dueSoon} icon="bolt" hint="< 5 min" />
        <BigMetricCard tone="primary" label="Em atendimento" value={inProgress} icon="chat" hint="Atribuídos" />
        <BigMetricCard tone="cyan" label="Aguardando" value={waiting} icon="queue" hint="Sem atendente" />
        <BigMetricCard tone="amber" label="Alta prioridade" value={highPriority} icon="ticket" hint="Urgente / Alta" />
        <BigMetricCard tone="primary" label="Resolvidos hoje" value={resolvedToday} icon="book" hint="Finalizados" />
      </div>

      <div className="toolbar">
        <div className="field">
          <label htmlFor="hq-type">Tipo</label>
          <select id="hq-type" className="select" value={type} onChange={(e) => { setPage(1); setType(e.target.value); }}>
            {TYPES.map((t) => (<option key={t} value={t}>{t ? TYPE_LABEL[t] : 'Todos'}</option>))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="hq-priority">Prioridade</label>
          <select id="hq-priority" className="select" value={priority} onChange={(e) => { setPage(1); setPriority(e.target.value); }}>
            {PRIORITIES.map((p) => (<option key={p} value={p}>{p || 'Todas'}</option>))}
          </select>
        </div>
        {!isKanban ? (
          <>
            <div className="field">
              <label htmlFor="hq-status">Status</label>
              <select id="hq-status" className="select" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
                {STATUSES.map((s) => (<option key={s} value={s}>{s || 'Todos'}</option>))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="hq-reason">Motivo</label>
              <select id="hq-reason" className="select" value={reason} onChange={(e) => { setPage(1); setReason(e.target.value); }}>
                {REASONS.map((r) => (<option key={r} value={r}>{r ? REASON_LABEL[r] ?? r : 'Todos'}</option>))}
              </select>
            </div>
          </>
        ) : null}
        <div className="field field--wide">
          <label htmlFor="hq-search">Buscar (cliente, telefone, resumo, motivo, tipo, prioridade)</label>
          <input id="hq-search" className="input" value={searchInput} onChange={(e) => { setPage(1); setSearchInput(e.target.value); }} placeholder="Digite para filtrar em tempo real…" />
        </div>
      </div>

      <div className="result-count">
        <strong>{rows.length}</strong> de {total} atendimento{total === 1 ? '' : 's'}
        {search ? <span className="muted"> · filtro: “{searchInput}”</span> : null}
      </div>

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} />
      ) : rows.length === 0 && total > 0 ? (
        <div className="state">Nenhum atendimento corresponde aos filtros. 🔍</div>
      ) : isKanban ? (
        <HumanQueueKanban
          rows={rows}
          usersById={usersById}
          busyId={busy ? busy.replace(/(assign|resolve|reopen)$/, '') : null}
          onOpen={openConversation}
          onAssign={(id) => act(id, 'assign')}
          onResolve={(id) => act(id, 'resolve')}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            emptyLabel="Fila vazia — nenhum handoff pendente. 🎉"
            rowClassName={(q) => (q.slaStatus === 'overdue' ? 'row--overdue' : '')}
          />
          <Pager page={data?.page ?? 1} limit={data?.limit ?? 20} total={data?.total ?? 0} onPage={setPage} unit="handoffs" />
        </>
      )}

      {selected ? (
        <div className="card mt-16">
          <div className="detail-header">
            <strong>Atendimento na fila · <ReasonBadge reason={selected.reason} /> <SlaBadge status={selected.slaStatus} /></strong>
            <ActionButton small variant="ghost" onClick={() => setSelected(null)}>Fechar</ActionButton>
          </div>
          <div className="kv"><span>Cliente</span><span>{selected.conversation?.customer?.name ?? selected.conversation?.contact ?? '—'}</span></div>
          <div className="kv"><span>Vence</span><span>{selected.dueAt ? new Date(selected.dueAt).toLocaleString('pt-BR') : '—'}</span></div>
          <p className="muted" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{selected.summary ?? 'Sem resumo.'}</p>
          <div className="toolbar mt-16">
            {selected.conversation?.id ? (
              <Link className="btn btn--primary btn--sm" href={`/conversations?c=${selected.conversation.id}`}>Abrir conversa</Link>
            ) : null}
            <AssigneeSelect busy={busy === selected.id + 'assign'} onAssign={(uid) => act(selected.id, 'assign', uid)} />
            {selected.status !== 'RESOLVED' ? (
              <ActionButton small variant="primary" onClick={() => act(selected.id, 'resolve')}>Resolver</ActionButton>
            ) : (
              <ActionButton small onClick={() => act(selected.id, 'reopen')}>Reabrir</ActionButton>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
