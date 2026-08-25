import { HumanQueueItem } from '@/lib/api/types';

/** Colunas operacionais do Kanban (derivadas de status + contexto). */
export type ColKey = 'NEW' | 'IN_PROGRESS' | 'WAITING_CLIENT' | 'WAITING_TECH' | 'FINANCE' | 'RESOLVED';

export const KANBAN_COLUMNS: { key: ColKey; label: string; hint: string }[] = [
  { key: 'NEW', label: 'Novos', hint: 'Sem atendente' },
  { key: 'IN_PROGRESS', label: 'Em atendimento', hint: 'Atribuídos' },
  { key: 'WAITING_CLIENT', label: 'Aguardando cliente', hint: 'Documento / confirmação' },
  { key: 'WAITING_TECH', label: 'Aguardando técnico', hint: 'OS / visita técnica' },
  { key: 'FINANCE', label: 'Financeiro', hint: 'PIX / boleto / cobrança' },
  { key: 'RESOLVED', label: 'Resolvidos', hint: 'Finalizados' },
];

const RE_FINANCE = /\bpix\b|boleto|cobran|pagamento|segunda via|2[ªa]?\s*via|fatura|d[ée]bito|mensalidade/i;
const RE_TECH = /\bos\b|ordem de servi|t[eé]cnic|agendad|visita|instala/i;
const RE_WAIT_CLIENT = /aguard|comprovante|documento|\brg\b|\bcpf\b|v[ií]deo|foto|anexo|envie|enviar|confirma|pendente|falta/i;

/**
 * Mapeia um item da fila para uma coluna operacional.
 * Precedência: Resolvido → Em atendimento (atribuído) → Financeiro →
 * Aguardando técnico → Aguardando cliente → Novos.
 */
export function columnOf(q: HumanQueueItem): ColKey {
  const status = (q.status || '').toUpperCase();
  if (status === 'RESOLVED') return 'RESOLVED';

  const assigned = status === 'ASSIGNED' || !!q.assignedUserId;
  if (assigned) return 'IN_PROGRESS';

  const intent = (q.conversation?.intent || '').toUpperCase();
  const reason = (q.reason || '').toUpperCase();
  const s = q.summary || '';

  if (intent === 'FINANCIAL' || RE_FINANCE.test(s)) return 'FINANCE';
  if (reason === 'COMPLEX_SUPPORT' || (intent === 'SUPPORT' && RE_TECH.test(s))) return 'WAITING_TECH';
  if (RE_WAIT_CLIENT.test(s)) return 'WAITING_CLIENT';
  return 'NEW';
}

/** Agrupa os itens por coluna, preservando a ordem recebida (já ordenada por SLA). */
export function groupByColumn(items: HumanQueueItem[]): Record<ColKey, HumanQueueItem[]> {
  const out: Record<ColKey, HumanQueueItem[]> = {
    NEW: [], IN_PROGRESS: [], WAITING_CLIENT: [], WAITING_TECH: [], FINANCE: [], RESOLVED: [],
  };
  for (const q of items) out[columnOf(q)].push(q);
  return out;
}

export const TYPE_BY_INTENT: Record<string, { key: string; label: string }> = {
  COMMERCIAL: { key: 'COMMERCIAL', label: 'Comercial' },
  SUPPORT: { key: 'SUPPORT', label: 'Suporte' },
  FINANCIAL: { key: 'FINANCIAL', label: 'Financeiro' },
  HUMAN: { key: 'HUMAN', label: 'Humano' },
};

/** Tipo (Comercial/Suporte/Financeiro) a partir do intent; cai para o reason. */
export function typeOf(q: HumanQueueItem): { key: string; label: string } | null {
  const intent = (q.conversation?.intent || '').toUpperCase();
  if (TYPE_BY_INTENT[intent]) return TYPE_BY_INTENT[intent];
  const reason = (q.reason || '').toUpperCase();
  if (reason === 'COMPLEX_SUPPORT') return TYPE_BY_INTENT.SUPPORT;
  if (reason === 'NEGOTIATION') return TYPE_BY_INTENT.COMMERCIAL;
  return null;
}

export const REASON_LABEL: Record<string, string> = {
  CLIENT_REQUEST: 'Pedido do cliente',
  COMPLEX_SUPPORT: 'Suporte complexo',
  NEGOTIATION: 'Negociação',
  API_ERROR: 'Erro de API',
  UNKNOWN_INTENT: 'Intenção desconhecida',
};

export const SLA_LABEL: Record<string, string> = {
  on_time: 'No prazo', due_soon: 'Vencendo', overdue: 'Atrasado', resolved: 'Resolvido',
};

/** Tempo em espera humanizado desde a criação. */
export function waitTime(createdAt: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/**
 * Mini-resumo determinístico (fallback local) para o card do Kanban:
 * próximo passo recomendado + pendência principal, sem chamar a API.
 */
export function cardHint(q: HumanQueueItem): { next: string; pending?: string } {
  const t = typeOf(q)?.key;
  const reason = (q.reason || '').toUpperCase();
  const s = (q.summary || '').toLowerCase();
  if (t === 'FINANCIAL' || reason === 'CLIENT_REQUEST') {
    return { next: 'Enviar 2ª via/PIX e confirmar pagamento', pending: /\bpix\b|boleto/.test(s) ? 'confirmar pagamento' : undefined };
  }
  if (t === 'SUPPORT' || reason === 'COMPLEX_SUPPORT') {
    return { next: 'Validar ISPBOX e encaminhar técnico', pending: /v[ií]deo|foto|evid/.test(s) ? undefined : 'evidência (vídeo)' };
  }
  if (t === 'COMMERCIAL' || reason === 'NEGOTIATION') {
    return { next: 'Confirmar dados e finalizar cadastro', pending: /comprovante|documento/.test(s) ? 'comprovante' : undefined };
  }
  return { next: 'Dar continuidade ao atendimento' };
}

/** Resumo curto (primeira frase relevante, sem cabeçalho), limitado a n chars. */
export function shortSummary(summary?: string | null, n = 120): string {
  if (!summary) return '';
  const firstMeaningful = summary
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 8 && !/^(cliente|canal|motivo|histórico)/i.test(l));
  const text = (firstMeaningful || summary).replace(/\s+/g, ' ').trim();
  return text.length > n ? `${text.slice(0, n)}…` : text;
}
