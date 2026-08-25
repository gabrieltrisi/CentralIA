type Tone = 'green' | 'amber' | 'red' | 'gray';

const TONE: Record<string, Tone> = {
  up: 'green',
  ok: 'green',
  configured: 'green',
  sandbox: 'amber',
  not_configured: 'gray',
  down: 'red',
  degraded: 'red',
};

export function IntegrationChip({
  name,
  status,
}: {
  name: string;
  status?: string | null;
}) {
  const tone = status ? TONE[status] ?? 'gray' : 'gray';
  return (
    <span className="ichip">
      <span className={`ichip__dot ichip__dot--${tone}`} />
      {name}
      <small>· {status ?? '—'}</small>
    </span>
  );
}
