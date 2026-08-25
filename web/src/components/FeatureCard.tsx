import { ReactNode } from 'react';

/** Mini-card de destaque (Fibra, WhatsApp Oficial, Suporte, Financeiro). */
export function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: ReactNode;
  text?: ReactNode;
}) {
  return (
    <div className="feature-card">
      <div className="feature-card__icon">{icon}</div>
      <div className="feature-card__title">{title}</div>
      {text ? <p className="feature-card__text">{text}</p> : null}
    </div>
  );
}
