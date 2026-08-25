import { ReactNode } from 'react';

/** Seção estilo landing: título grande + subtítulo + conteúdo. */
export function SiteSection({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="site-section">
      <div className="site-section__head">
        <div>
          <h2 className="site-section__title">{title}</h2>
          {subtitle ? <p className="site-section__sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="row-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
