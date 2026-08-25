'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { useRealtime } from '@/lib/realtime/realtime-context';
import { ActionButton } from './ActionButton';
import { User } from '@/lib/api/types';

const PRESENCE_MARK: Record<string, string> = { ONLINE: '🟢', AWAY: '🟡', OFFLINE: '⚪' };

/** Seletor de atendente: carrega /users e atribui ao alvo escolhido. */
export function AssigneeSelect({
  onAssign,
  busy,
}: {
  onAssign: (assignedUserId: string) => void;
  busy?: boolean;
}) {
  const { request, user } = useAuth();
  const { presence } = useRealtime();
  const [value, setValue] = useState('');
  const { data } = useQuery(() => request<User[]>('/users?active=true'), [request]);

  const users = data ?? [];

  return (
    <div className="flex-row">
      <select
        className="select"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Atendente"
      >
        <option value="">Atribuir a…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {PRESENCE_MARK[presence[u.id] ?? 'OFFLINE']} {u.name} ({u.role}){u.id === user?.id ? ' · eu' : ''}
          </option>
        ))}
      </select>
      <ActionButton
        small
        variant="primary"
        disabled={busy || !value}
        onClick={() => value && onAssign(value)}
      >
        OK
      </ActionButton>
    </div>
  );
}
