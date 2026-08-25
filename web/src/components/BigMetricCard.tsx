import { ReactNode } from 'react';
import { Icon, IconName } from './Icon';

/** Card de métrica grande (número grande + ícone + CTA pequeno). */
export function BigMetricCard({
  label,
  value,
  icon,
  hint,
  tone = 'primary',
  cta,
}: {
  label: ReactNode;
  value: ReactNode;
  icon: IconName;
  hint?: ReactNode;
  tone?: 'primary' | 'cyan' | 'amber' | 'red';
  cta?: ReactNode;
}) {
  return (
    <div className={`big-metric big-metric--${tone}`}>
      <div className="big-metric__top">
        <span className="big-metric__icon"><Icon name={icon} className="" size={20} /></span>
        {cta ? <span className="big-metric__cta">{cta}</span> : null}
      </div>
      <div className="big-metric__value">{value}</div>
      <div className="big-metric__label">{label}</div>
      {hint ? <div className="big-metric__hint">{hint}</div> : null}
    </div>
  );
}
