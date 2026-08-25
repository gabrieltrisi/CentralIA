'use client';

import { HumanQueueItem } from '@/lib/api/types';
import { KANBAN_COLUMNS, groupByColumn } from '@/lib/human-queue/kanban';
import { KanbanCard } from './KanbanCard';

/** Quadro Kanban operacional da fila humana. Colunas derivadas de status + contexto. */
export function HumanQueueKanban({
  rows,
  usersById,
  busyId,
  onOpen,
  onAssign,
  onResolve,
}: {
  rows: HumanQueueItem[];
  usersById: Record<string, string>;
  busyId?: string | null;
  onOpen: (conversationId?: string) => void;
  onAssign: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const grouped = groupByColumn(rows);

  return (
    <div className="kanban" role="list">
      {KANBAN_COLUMNS.map((col) => {
        const items = grouped[col.key];
        return (
          <section className={`kbcol kbcol--${col.key.toLowerCase()}`} key={col.key} role="listitem">
            <header className="kbcol__head">
              <div className="kbcol__titles">
                <span className="kbcol__title">{col.label}</span>
                <span className="kbcol__hint">{col.hint}</span>
              </div>
              <span className="kbcol__count">{items.length}</span>
            </header>
            <div className="kbcol__body">
              {items.length === 0 ? (
                <div className="kbcol__empty">Sem itens</div>
              ) : (
                items.map((q) => (
                  <KanbanCard
                    key={q.id}
                    item={q}
                    assigneeName={q.assignedUserId ? usersById[q.assignedUserId] : null}
                    busy={busyId === q.id}
                    onOpen={() => onOpen(q.conversation?.id)}
                    onAssign={() => onAssign(q.id)}
                    onResolve={() => onResolve(q.id)}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
