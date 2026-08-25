/**
 * Marca oficial ChipNews (logo SVG oficial em /public) + nome do produto CentralIA.
 * - `plate`: fundo navy arredondado (use sobre superfícies CLARAS, pois o amarelo
 *   do logo tem baixo contraste no branco).
 * - `withText`: mostra "CentralIA" + tagline ao lado do logo.
 */
export function BrandMark({
  size = 28,
  withText = true,
  subtitle = true,
  plate = false,
}: {
  size?: number;
  withText?: boolean;
  subtitle?: boolean;
  plate?: boolean;
}) {
  return (
    <div className={`brandmark ${plate ? 'brandmark--plate' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/chipnews-logo.svg" alt="ChipNews" className="brandmark__logo" style={{ height: size }} />
      {withText ? (
        <span className="brandmark__sep" aria-hidden="true" />
      ) : null}
      {withText ? (
        <span className="brandmark__text">
          <span className="brandmark__name">CentralIA</span>
          {subtitle ? <span className="brandmark__sub">Atendimento Inteligente</span> : null}
        </span>
      ) : null}
    </div>
  );
}
