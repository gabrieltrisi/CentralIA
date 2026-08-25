'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { useRealtime } from '@/lib/realtime/realtime-context';
import { Icon } from './Icon';
import { BrandMark } from './BrandMark';
import { HealthReport } from '@/lib/api/types';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/conversations', label: 'Conversas' },
  { href: '/human-queue', label: 'Fila' },
  { href: '/knowledge', label: 'Conhecimento' },
  { href: '/settings/ispbox', label: 'ISPBOX' },
];

/** Header estilo site ChipNews: links horizontais + status + usuário. */
export function SiteLikeHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout, request } = useAuth();
  const { connected } = useRealtime();
  const pathname = usePathname();
  const { data: health } = useQuery(() => request<HealthReport>('/health'), [request]);
  const sandbox = health?.appMode === 'sandbox';
  const initial = (user?.name ?? '?').charAt(0).toUpperCase();

  return (
    <header className="shell__header sitehead">
      <div className="mobile-topbar">
        <button type="button" className="hamburger" aria-label="Abrir menu" onClick={onMenuClick}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <BrandMark size={22} plate withText={false} />
      </div>

      <nav className="sitehead__nav" aria-label="Navegação rápida">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={pathname?.startsWith(l.href) ? 'is-active' : ''}>
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="sitehead__right">
        <span className={`statuspill ${connected ? 'is-on' : 'is-off'}`} title={connected ? 'Tempo real conectado' : 'Reconectando'}>
          <span className="statuspill__dot" />
          {connected ? 'Sistema online' : 'Reconectando'}
        </span>
        {health?.appMode ? (
          <span className={`modepill ${sandbox ? 'is-sandbox' : 'is-prod'}`}>{sandbox ? 'Sandbox ativo' : 'Produção'}</span>
        ) : null}
        <div className="sitehead__user">
          <div className="avatar avatar--sm">{initial}</div>
          <div className="sitehead__umeta">
            <strong>{user?.name?.split(' ')[0]}</strong>
            <small>{user?.role}</small>
          </div>
        </div>
        <button type="button" className="cnbtn cnbtn--ghost cnbtn--sm" onClick={() => logout()} aria-label="Sair">
          <Icon name="logout" className="" size={15} /> Sair
        </button>
      </div>
    </header>
  );
}
