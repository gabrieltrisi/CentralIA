import { ReactNode } from 'react';

/** Bloco hero arredondado com gradiente (topo de login/dashboard). */
export function HeroSection({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  compact,
  logo,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
  logo?: boolean;
}) {
  return (
    <section className={`hero ${compact ? 'hero--compact' : ''}`}>
      <span className="hero__glow" aria-hidden="true" />
      <div className="hero__content">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/chipnews-logo.svg" alt="ChipNews" className="hero__logo" />
        ) : null}
        {eyebrow ? <span className="hero__eyebrow">{eyebrow}</span> : null}
        <h1 className="hero__title">{title}</h1>
        {subtitle ? <p className="hero__sub">{subtitle}</p> : null}
        {actions ? <div className="hero__actions">{actions}</div> : null}
        {children}
      </div>
    </section>
  );
}
