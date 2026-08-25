type Tone = 'green' | 'amber' | 'red' | 'gray' | 'primary' | 'secondary';

const TONES: Record<string, Tone> = {
  // conversation / queue / ticket
  BOT: 'primary',
  PENDING: 'amber',
  HUMAN: 'amber',
  OPEN: 'amber',
  WAITING: 'amber',
  ASSIGNED: 'secondary',
  IN_PROGRESS: 'amber',
  RESOLVED: 'green',
  CLOSED: 'gray',
  FINISHED: 'gray',
  // ticket types
  SUPPORT: 'secondary',
  COMMERCIAL: 'primary',
  FINANCIAL: 'amber',
  // health
  up: 'green',
  ok: 'green',
  configured: 'green',
  sandbox: 'amber',
  not_configured: 'gray',
  down: 'red',
  degraded: 'red',
  live: 'green',
};

const LABELS: Record<string, string> = {
  BOT: 'IA atendendo',
  HUMAN: 'Humano',
  PENDING: 'Pendente',
  CLOSED: 'Finalizado',
  FINISHED: 'Finalizado',
  WAITING: 'Aguardando',
  ASSIGNED: 'Em atendimento',
  RESOLVED: 'Resolvido',
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  SUPPORT: 'Suporte',
  COMMERCIAL: 'Comercial',
  FINANCIAL: 'Financeiro',
};

export function StatusBadge({
  value,
  friendly,
}: {
  value?: string | null;
  friendly?: boolean;
}) {
  if (!value) return <span className="badge badge--gray">—</span>;
  const tone = TONES[value] ?? 'gray';
  const text = friendly ? LABELS[value] ?? value : value;
  return <span className={`badge badge--${tone}`}>{text}</span>;
}
