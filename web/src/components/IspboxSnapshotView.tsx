'use client';

import { IspboxSnapshot } from '@/lib/api/types';

function money(v: number | null): string {
  return v == null ? '—' : `R$ ${v.toFixed(2).replace('.', ',')}`;
}

/** Exibição somente-leitura do snapshot ISPBOX (serviços, status, cobranças). */
export function IspboxSnapshotView({ snapshot }: { snapshot?: IspboxSnapshot | null }) {
  if (!snapshot) return null;
  if (!snapshot.available) {
    return <p className="muted">{snapshot.reason ?? 'Dados ISPBOX indisponíveis.'}</p>;
  }
  const c = snapshot.charges;
  return (
    <div>
      <div className="kv">
        <span>Status internet</span>
        <span className={`badge badge--${snapshot.internetStatus?.online ? 'primary' : 'red'}`}>
          {snapshot.internetStatus ? (snapshot.internetStatus.online ? 'online' : (snapshot.internetStatus.status || 'offline')) : '—'}
        </span>
      </div>
      <div className="kv">
        <span>Serviços</span>
        <span>{snapshot.services?.length ? snapshot.services.map((s) => `${s.tipo ?? 'serviço'} (${s.status ?? '—'})`).join(', ') : '—'}</span>
      </div>
      {c ? (
        <>
          <div className="kv"><span>Cobranças vencidas</span><span className={`badge badge--${c.overdue.length ? 'red' : 'gray'}`}>{c.overdue.length}</span></div>
          <div className="kv"><span>Cobranças abertas</span><span className="badge badge--amber">{c.open.length}</span></div>
          {[...c.overdue, ...c.open].slice(0, 5).map((ch) => (
            <div className="kv" key={ch.id}>
              <span className="muted">#{ch.id} · venc. {ch.vencimento ?? '—'}</span>
              <span>{money(ch.valor)} <span className={`badge badge--${ch.situacao === 'overdue' ? 'red' : 'amber'}`}>{ch.situacao === 'overdue' ? 'vencida' : 'aberta'}</span></span>
            </div>
          ))}
        </>
      ) : null}
      {snapshot.fetchedAt ? (
        <div className="kv"><span>Última consulta</span><span className="muted">{new Date(snapshot.fetchedAt).toLocaleString('pt-BR')}</span></div>
      ) : null}
    </div>
  );
}
