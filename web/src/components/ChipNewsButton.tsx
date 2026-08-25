import { ReactNode } from 'react';
import Link from 'next/link';

type Variant = 'cta' | 'primary' | 'outline' | 'ghost';

/** Botão estilo site ChipNews (CTA forte com gradiente verde→ciano). */
export function ChipNewsButton({
  children,
  variant = 'cta',
  href,
  onClick,
  type = 'button',
  disabled,
  small,
  full,
  ariaLabel,
}: {
  children: ReactNode;
  variant?: Variant;
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  small?: boolean;
  full?: boolean;
  ariaLabel?: string;
}) {
  const cls = `cnbtn cnbtn--${variant}${small ? ' cnbtn--sm' : ''}${full ? ' cnbtn--full' : ''}`;
  if (href) {
    return (
      <Link href={href} className={cls} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
