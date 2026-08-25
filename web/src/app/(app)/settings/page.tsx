'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import { API_URL } from '@/lib/api/client';
import { PageHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';

export default function SettingsPage() {
  const { user, hasRole } = useAuth();
  return (
    <div>
      <PageHeader title="Configurações" subtitle="Sua conta e o ambiente do painel" />
      <div className="grid grid--stats">
        <MetricCard label="Usuário" value={user?.name ?? '—'} hint={user?.email} icon="users" />
        <MetricCard label="Papel (role)" value={user?.role ?? '—'} icon="settings" />
        <MetricCard label="Empresa" value={user?.companyId?.slice(0, 8) ?? '—'} icon="bolt" />
      </div>
      <div className="card mt-16">
        <strong>Ambiente</strong>
        <p style={{ color: 'var(--muted)', marginBottom: 4 }}>
          API: <code>{API_URL}</code>
        </p>
        {hasRole('MANAGER') ? (
          <div className="toolbar" style={{ marginTop: 8 }}>
            <Link className="btn btn--primary btn--sm" href="/settings/diagnostics">Diagnóstico do piloto →</Link>
            <Link className="btn btn--ghost btn--sm" href="/settings/ispbox">ISPBOX →</Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
