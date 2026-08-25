import { ReactNode } from 'react';

const OK = ['up', 'ok', 'configured', 'sandbox', 'production', 'live'];

/** Card de status de integração (Meta, ISPBOX, Redis, DB, IA, Storage). */
export function IntegrationStatusCard({
  name,
  status,
  icon,
}: {
  name: string;
  status?: string | null;
  icon?: ReactNode;
}) {
  const ok = !!status && OK.includes(status);
  const sandbox = status === 'sandbox';
  const tone = sandbox ? 'sandbox' : ok ? 'ok' : 'off';
  return (
    <div className={`int-card int-card--${tone}`}>
      {icon ? <div className="int-card__icon">{icon}</div> : null}
      <div className="int-card__body">
        <div className="int-card__name">{name}</div>
        <div className="int-card__status">
          <span className="int-card__dot" />
          {status ?? '—'}
        </div>
      </div>
    </div>
  );
}
