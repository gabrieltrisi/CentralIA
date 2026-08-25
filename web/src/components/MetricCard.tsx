import { ReactNode } from 'react';
import { Icon, IconName } from './Icon';

export function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="metric">
      <div className="metric__head">
        <div className="metric__label">{label}</div>
        {icon ? (
          <div className="metric__icon">
            <Icon name={icon} className="" size={20} />
          </div>
        ) : null}
      </div>
      <div className="metric__value">{value}</div>
      {hint ? <div className="metric__hint">{hint}</div> : null}
    </div>
  );
}
