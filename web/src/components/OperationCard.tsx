import { Icon, IconName } from './Icon';
import { ChipNewsButton } from './ChipNewsButton';

/** Card de operação (Comercial / Suporte / Financeiro) estilo plano do site. */
export function OperationCard({
  title,
  description,
  status,
  statusTone = 'primary',
  href,
  icon,
  accent = 'primary',
}: {
  title: string;
  description: string;
  status?: string;
  statusTone?: 'primary' | 'cyan' | 'amber' | 'green';
  href: string;
  icon: IconName;
  accent?: 'primary' | 'cyan' | 'amber' | 'green';
}) {
  return (
    <div className={`op-card op-card--${accent}`}>
      <div className="op-card__icon"><Icon name={icon} className="" size={22} /></div>
      <h3 className="op-card__title">{title}</h3>
      <p className="op-card__desc">{description}</p>
      <div className="op-card__foot">
        {status ? <span className={`badge badge--${statusTone}`}>{status}</span> : <span />}
        <ChipNewsButton variant="outline" small href={href}>Abrir →</ChipNewsButton>
      </div>
    </div>
  );
}
