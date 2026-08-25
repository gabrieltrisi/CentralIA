import { ChipNewsButton } from './ChipNewsButton';

function priceOf(content: string): string | null {
  const m = content.match(/R\$\s*[\d.]+,\d{2}/);
  return m ? m[0] : null;
}

/** Quebra título "START 200 MEGA" em nome (START) + velocidade (200 MEGA). */
function splitTitle(title: string): { name: string; speed: string } {
  const m = title.match(/^(\S+)\s+(.*)$/);
  return m ? { name: m[1], speed: m[2] } : { name: title, speed: '' };
}

/** Separa "200 MEGA" / "1 GIGA" em número grande + unidade. */
function splitSpeed(speed: string): { num: string; unit: string } | null {
  const m = speed.match(/^([\d.]+)\s*(MEGA|GIGA|MB|GB|GIGAS?|MEGAS?)?/i);
  if (!m) return null;
  return { num: m[1], unit: (m[2] ?? 'MEGA').toUpperCase().replace(/S$/, '') };
}

function featuresOf(content: string): string[] {
  return content
    .replace(/\[recomendado\]/i, '')
    .replace(/R\$\s*[\d.]+,\d{2}\s*[—-]?\s*/, '')
    .split(/[.|;]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 4);
}

/**
 * Cartão comercial de plano no estilo dos cards do site ChipNews:
 * nome em caps, velocidade GIGANTE, preço destacado, selo, bullets e CTA.
 * Plano recomendado ganha destaque ("MAIS VENDIDO").
 */
export function PlanLikeCard({
  title,
  content,
  active = true,
  onEdit,
  canEdit,
}: {
  title: string;
  content: string;
  active?: boolean;
  onEdit?: () => void;
  canEdit?: boolean;
}) {
  const { name, speed } = splitTitle(title);
  const sp = speed ? splitSpeed(speed) : null;
  const price = priceOf(content);
  const recommended = /\[recomendado\]/i.test(content);
  const promo = /promo|instala[çc][ãa]o gr[áa]tis|gr[áa]tis/i.test(content);
  const features = featuresOf(content);

  return (
    <div className={`plan-like ${recommended ? 'plan-like--rec' : ''} ${active ? '' : 'plan-like--off'}`}>
      {recommended ? <span className="plan-like__ribbon">★ Mais vendido</span> : null}
      <div className="plan-like__name">{name}</div>
      {sp ? (
        <div className="plan-like__speed">{sp.num}<span className="unit">{sp.unit}</span></div>
      ) : speed ? (
        <div className="plan-like__speed">{speed}</div>
      ) : null}
      <div className="plan-like__price">
        {price ? <><span className="plan-like__cents">{price}</span><span className="plan-like__mo">/mês</span></> : <span className="plan-like__cents">consultar</span>}
      </div>
      <div className={`plan-like__tag ${promo ? 'is-promo' : ''}`}>{promo ? 'PROMOCIONAL' : '100% FIBRA ÓPTICA'}</div>
      <ul className="plan-like__feats">
        {features.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
      <div className="plan-like__foot">
        {canEdit ? (
          <ChipNewsButton variant="primary" full small onClick={onEdit}>Editar plano</ChipNewsButton>
        ) : (
          <ChipNewsButton variant="cta" full small>Assinar agora</ChipNewsButton>
        )}
        <span className={`badge badge--${active ? 'green' : 'gray'} plan-like__state`}>
          {active ? 'Ativo' : 'Inativo'}
        </span>
      </div>
    </div>
  );
}
