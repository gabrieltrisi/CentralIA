import { ButtonHTMLAttributes } from 'react';

type Variant = 'default' | 'primary' | 'danger' | 'ghost';

export function ActionButton({
  variant = 'default',
  small,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    small ? 'btn--sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button className={classes} {...rest} />;
}
