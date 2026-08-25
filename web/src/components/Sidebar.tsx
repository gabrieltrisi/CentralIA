'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { Icon, IconName } from './Icon';
import { BrandMark } from './BrandMark';
import { SystemStatusChip } from './SystemStatusChip';
import { ChipNewsButton } from './ChipNewsButton';
import { HealthReport } from '@/lib/api/types';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  roles?: string[];
}

// Itens primários sempre visíveis (menos densidade no topo).
const PRIMARY: NavItem[] = [
  { href: '/dashboard', label: 'Início', icon: 'dashboard' },
  { href: '/conversations', label: 'Conversas', icon: 'chat' },
  { href: '/human-queue', label: 'Fila Humana', icon: 'queue' },
  { href: '/tickets', label: 'Tickets', icon: 'ticket' },
  { href: '/knowledge', label: 'Planos & Conhecimento', icon: 'book' },
];

// Itens secundários sob o rótulo "Gestão" (mais respiro, menos itens aparentes).
const SECONDARY: NavItem[] = [
  { href: '/customers', label: 'Clientes', icon: 'users' },
  { href: '/audit-logs', label: 'Auditoria', icon: 'audit', roles: ['ADMIN', 'MANAGER'] },
  { href: '/settings', label: 'Configurações', icon: 'settings' },
];

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { hasRole, request } = useAuth();
  const { data: health } = useQuery(() => request<HealthReport>('/health'), [request]);

  const renderItem = (it: NavItem) => {
    const active = pathname?.startsWith(it.href);
    return (
      <Link
        key={it.href}
        href={it.href}
        className={active ? 'active' : ''}
        aria-current={active ? 'page' : undefined}
        onClick={onClose}
      >
        <Icon name={it.icon} />
        {it.label}
      </Link>
    );
  };

  return (
    <aside className={`shell__sidebar ${open ? 'is-open' : ''}`}>
      <div className="brand">
        <BrandMark size={28} subtitle />
      </div>

      <nav className="nav" aria-label="Navegação principal">
        {PRIMARY.map(renderItem)}
        <span className="nav__label">Gestão</span>
        {SECONDARY.filter((it) => !it.roles || hasRole(...it.roles)).map(renderItem)}
      </nav>

      <div className="sidebar-cta">
        <div className="sidebar-cta__title">Atenda pelo WhatsApp</div>
        <p className="sidebar-cta__text">Converse com clientes em tempo real e acione a IA quando precisar.</p>
        <ChipNewsButton variant="cta" small full href="/conversations">Abrir central →</ChipNewsButton>
      </div>

      <div className="sidebar__foot">
        <SystemStatusChip appMode={health?.appMode} />
      </div>
    </aside>
  );
}
