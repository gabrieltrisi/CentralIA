const SLA_LABEL: Record<string, string> = {
  on_time: 'No prazo',
  due_soon: 'Vencendo',
  overdue: 'Atrasado',
  resolved: 'Resolvido',
};

/** Selo de SLA: verde (no prazo), amarelo (vencendo), vermelho (atrasado). */
export function SlaBadge({ status }: { status?: string }) {
  if (!status) return <span className="sla sla--on_time">—</span>;
  return <span className={`sla sla--${status}`}>{SLA_LABEL[status] ?? status}</span>;
}
