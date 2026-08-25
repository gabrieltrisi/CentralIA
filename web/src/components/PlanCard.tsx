import { ReactNode } from 'react';

/** Extrai preço "R$ 99,90" do conteúdo do artigo. */
function priceOf(content: string): string | null {
  const m = content.match(/R\$\s*[\d.]+,\d{2}/);
  return m ? m[0] : null;
}

/**
 * Cartão comercial de plano (aparência de site). Usa o título como nome/velocidade
 * e o conteúdo para preço/descrição; marca o recomendado ([recomendado]).
 */
export function PlanCard({
  title,
  content,
  active = true,
  actions,
}: {
  title: string;
  content: string;
  active?: boolean;
  actions?: ReactNode;
}) {
  const recommended = /\[recomendado\]/i.test(content);
  const price = priceOf(content);
  const desc = content.replace(/\[recomendado\]/i, '').replace(/R\$\s*[\d.]+,\d{2}\s*[—-]?\s*/, '').trim();

  return (
    <div className={`plan-card ${recommended ? 'plan-card--rec' : ''} ${active ? '' : 'plan-card--off'}`}>
      {recommended ? <span className="plan-card__ribbon">Recomendado</span> : null}
      <div className="plan-card__name">{title}</div>
      {price ? <div className="plan-card__price">{price}<span>/mês</span></div> : null}
      <p className="plan-card__desc">{desc || '—'}</p>
      <div className="plan-card__foot">
        <span className={`badge badge--${active ? 'primary' : 'gray'}`}>{active ? 'Ativo' : 'Inativo'}</span>
        {actions}
      </div>
    </div>
  );
}
