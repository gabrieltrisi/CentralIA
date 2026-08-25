import { ReactNode } from 'react';

/** Card com título de seção e ação opcional — padroniza blocos técnicos. */
export function SectionCard({
  title,
  icon,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section-card ${className}`}>
      {title ? (
        <header className="section-card__head">
          <div className="section-card__title">
            {icon ? <span className="section-card__icon">{icon}</span> : null}
            {title}
          </div>
          {actions ? <div className="row-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="section-card__body">{children}</div>
    </section>
  );
}
