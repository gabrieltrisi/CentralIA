'use client';

import { HumanQueueItem } from '@/lib/api/types';
import { REASON_LABEL, SLA_LABEL, typeOf, waitTime, shortSummary, cardHint } from '@/lib/human-queue/kanban';

const PRIORITY_TONE: Record<string, string> = { URGENT: 'red', HIGH: 'amber', NORMAL: 'gray', LOW: 'gray' };

/** Card operacional de handoff (estilo Pipefy/Jira com identidade ChipNews). */
export function KanbanCard({
  item,
  assigneeName,
  busy,
  onOpen,
  onAssign,
  onResolve,
}: {
  item: HumanQueueItem;
  assigneeName?: string | null;
  busy?: boolean;
  onOpen: () => void;
  onAssign: () => void;
  onResolve: () => void;
}) {
  const sla = item.slaStatus ?? 'on_time';
  const type = typeOf(item);
  const name = item.conversation?.customer?.name ?? item.conversation?.contact ?? 'Sem identificação';
  const phone = item.conversation?.customer?.phone ?? item.conversation?.contact ?? null;
  const summary = shortSummary(item.summary);
  const resolved = item.status === 'RESOLVED';
  const assigned = !!item.assignedUserId;
  const hint = cardHint(item); // mini-resumo local (próximo passo + pendência)

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <article
      className={`kbcard kbcard--${sla}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
    >
      <div className="kbcard__top">
        <span className="kbcard__name">{name}</span>
        <span className={`sla sla--${sla}`}>{SLA_LABEL[sla] ?? sla}</span>
      </div>
      {phone ? <div className="kbcard__phone">📱 {phone}</div> : null}

      <div className="kbcard__tags">
        {type ? <span className={`intent-badge intent-badge--${type.key}`}>{type.label}</span> : null}
        <span className="badge badge--gray">{REASON_LABEL[item.reason] ?? item.reason}</span>
      </div>

      {summary ? <p className="kbcard__summary">{summary}</p> : null}

      {!resolved ? (
        <div className="kbcard__hint">
          <span className="kbcard__hint-next">▸ {hint.next}</span>
          {hint.pending ? <span className="kbcard__hint-pending">pendente: {hint.pending}</span> : null}
        </div>
      ) : null}

      <div className="kbcard__meta">
        <span className={`badge badge--${PRIORITY_TONE[item.priority ?? 'NORMAL'] ?? 'gray'}`}>{item.priority ?? 'NORMAL'}</span>
        <span className="kbcard__wait">⏱ {waitTime(item.createdAt)}</span>
      </div>

      {assigned ? (
        <div className="kbcard__assignee">
          <span className="kbcard__avatar">{(assigneeName ?? '?').charAt(0).toUpperCase()}</span>
          <span>{assigneeName ?? 'Atribuído'}</span>
        </div>
      ) : null}

      <div className="kbcard__actions" onClick={stop}>
        <button type="button" className="cnbtn cnbtn--outline cnbtn--sm" onClick={onOpen}>Abrir</button>
        {!resolved && !assigned ? (
          <button type="button" className="cnbtn cnbtn--primary cnbtn--sm" disabled={busy} onClick={onAssign}>Assumir</button>
        ) : null}
        {!resolved ? (
          <button type="button" className="cnbtn cnbtn--cta cnbtn--sm" disabled={busy} onClick={onResolve}>Resolver</button>
        ) : null}
      </div>
    </article>
  );
}
