import { ApiError } from '@/lib/api/client';

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="state">
      <div className="spinner" />
      {label}
    </div>
  );
}

export function EmptyState({ label = 'Nada por aqui ainda.' }: { label?: string }) {
  return <div className="state">{label}</div>;
}

export function ErrorState({ error }: { error: unknown }) {
  const status = error instanceof ApiError ? error.status : undefined;
  let message = error instanceof Error ? error.message : 'Erro inesperado.';
  if (status === 403) message = 'Você não tem permissão para acessar este recurso.';
  if (status === 401) message = 'Sessão expirada. Faça login novamente.';
  return <div className="state state--error">⚠ {message}</div>;
}
