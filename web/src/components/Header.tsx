'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useRealtime } from '@/lib/realtime/realtime-context';
import { Icon } from './Icon';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function Header() {
  const { user, logout } = useAuth();
  const { connected, presence } = useRealtime();
  const initial = (user?.name ?? '?').charAt(0).toUpperCase();
  const onlineCount = Object.values(presence).filter((s) => s === 'ONLINE').length;

  return (
    <header className="shell__header">
      <div className="greeting">
        <div className="greeting__hi">
          {greeting()}, {user?.name?.split(' ')[0] ?? 'atendente'} 👋
        </div>
        <div className="greeting__sub">Atendimento inteligente para provedores</div>
      </div>
      <div className="user-chip">
        <div
          className={`rt-status ${connected ? 'rt-status--on' : 'rt-status--off'}`}
          title={connected ? 'Tempo real conectado' : 'Tempo real offline — usando atualização periódica'}
        >
          <span className="rt-dot" />
          {connected ? 'Online' : 'Offline'}
          {connected && onlineCount > 0 ? <span className="rt-count">{onlineCount}</span> : null}
        </div>
        <div className="user-chip__meta">
          <div>{user?.name}</div>
          <small>{user?.role}</small>
        </div>
        <div className="avatar">
          {initial}
          <span className={`avatar__dot avatar__dot--${connected ? 'online' : 'offline'}`} />
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => logout()} title="Sair">
          <Icon name="logout" className="" size={15} />
          Sair
        </button>
      </div>
    </header>
  );
}
