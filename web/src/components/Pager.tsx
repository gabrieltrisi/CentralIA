'use client';

import { ActionButton } from './ActionButton';

/** Paginação básica (server-side): mostra total, página e navegação. */
export function Pager({
  page,
  limit,
  total,
  onPage,
  unit = 'registros',
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
  unit?: string;
}) {
  const lastPage = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="toolbar toolbar--end mt-12">
      <span className="muted">
        {total} {unit} · página {page} de {lastPage}
      </span>
      <ActionButton small disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Anterior
      </ActionButton>
      <ActionButton small disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
        Próxima
      </ActionButton>
    </div>
  );
}
