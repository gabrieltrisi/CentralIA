import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConversationsService } from '../conversations.service';
import { slaStatusOf } from '../../human-queue/human-queue.service';
import { ConversationSummary, CopilotIntent, CopilotUrgency } from './copilot.types';

const INTENT_LABEL: Record<string, string> = {
  COMMERCIAL: 'Comercial', SUPPORT: 'Suporte', FINANCIAL: 'Financeiro', HUMAN: 'Humano',
};
const REASON_LABEL: Record<string, string> = {
  CLIENT_REQUEST: 'Pedido do cliente', COMPLEX_SUPPORT: 'Suporte complexo',
  NEGOTIATION: 'Negociação', API_ERROR: 'Erro de API', UNKNOWN_INTENT: 'Intenção desconhecida',
};
const COLLECTED_LABEL: Record<string, string> = {
  nome: 'Nome', cpf: 'CPF', rg: 'RG', telefone: 'Telefone', email: 'E-mail', endereco: 'Endereço',
};
const MEDIA_TYPES = ['image', 'document', 'video', 'audio'];

/**
 * Resumo inteligente DETERMINÍSTICO da conversa (não depende de IA externa).
 * Fontes: conversation.intent, FSM (state/collectedData), messages, customer,
 * ticket, human queue e attachments. Respeita companyId via getDetail.
 */
@Injectable()
export class ConversationSummaryService {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly prisma: PrismaService,
  ) {}

  async build(conversationId: string, companyId: string): Promise<ConversationSummary> {
    const c = await this.conversations.getDetail(conversationId, companyId);
    const collected = (c.fsm?.collectedData ?? {}) as Record<string, unknown>;
    const intent = ((c.intent ?? '').toUpperCase() || this.intentFromReasonOrTicket(c)) as CopilotIntent;
    const customerName = c.customer?.name ?? c.contact ?? 'Sem identificação';
    const ticket = c.tickets?.[0];
    const attachmentTypes = (c.attachments ?? []).map((a) => a.type).filter(Boolean) as string[];
    const hq = await this.prisma.humanQueue.findFirst({
      where: { conversationId, status: { not: 'RESOLVED' } },
      orderBy: { createdAt: 'desc' },
    });

    const collectedData = Object.keys(COLLECTED_LABEL)
      .filter((k) => has(collected[k]))
      .map((k) => COLLECTED_LABEL[k]);

    const highlights = this.buildHighlights(collected, ticket, attachmentTypes, c.messages ?? []);
    const pendingItems = this.buildPending(intent, collected, ticket, attachmentTypes, c.messages ?? []);
    const recommendedNextStep = this.buildNextStep(intent, pendingItems, ticket, collected, c.messages ?? []);
    const currentSituation = this.buildSituation(intent, c.status, ticket, collected, c.messages ?? []);
    const urgency = this.buildUrgency(hq, c.status);

    return {
      conversationId,
      customerName,
      intent: INTENT_LABEL[intent] ? intent : 'UNKNOWN',
      intentLabel: INTENT_LABEL[intent] ?? 'Geral',
      currentSituation,
      highlights,
      collectedData,
      pendingItems,
      recommendedNextStep,
      urgency,
      handoffReason: hq ? REASON_LABEL[hq.reason] ?? hq.reason : null,
      lastUpdatedAt: (c.lastMessageAt ?? c.updatedAt ?? new Date()).toISOString?.() ?? new Date().toISOString(),
      aiEnhanced: false,
    };
  }

  private intentFromReasonOrTicket(c: { tickets?: { type?: string }[] }): string {
    const t = c.tickets?.[0]?.type;
    if (t === 'SUPPORT') return 'SUPPORT';
    if (t === 'FINANCIAL') return 'FINANCIAL';
    if (t === 'COMMERCIAL') return 'COMMERCIAL';
    return 'UNKNOWN';
  }

  private buildHighlights(
    collected: Record<string, unknown>,
    ticket: { status?: string; ispboxOsId?: string | null; workOrders?: unknown[] } | undefined,
    attachmentTypes: string[],
    messages: { role: string; content: string }[],
  ): string[] {
    const out: string[] = [];
    if (has(collected.servico)) out.push(`Serviço: ${String(collected.servico)}`);
    if (has(collected.plano)) out.push(`Plano: ${String(collected.plano)}`);
    if (has(collected.cep)) out.push(`CEP: ${String(collected.cep)}`);
    if (attachmentTypes.some((t) => MEDIA_TYPES.includes(t))) {
      out.push(`Evidências: ${attachmentTypes.join(', ')}`);
    }
    if (ticket) out.push(`Ticket: ${friendlyStatus(ticket.status)}`);
    if (this.mentions(messages, /\bpix\b/i)) out.push('PIX: gerado');
    else if (this.mentions(messages, /boleto|segunda via|2[ªa]?\s*via/i)) out.push('Cobrança: 2ª via/boleto');
    return out;
  }

  private buildPending(
    intent: string,
    collected: Record<string, unknown>,
    ticket: unknown,
    attachmentTypes: string[],
    messages: { role: string; content: string }[],
  ): string[] {
    const out: string[] = [];
    if (intent === 'COMMERCIAL') {
      for (const [k, label] of Object.entries(COLLECTED_LABEL)) {
        if (!has(collected[k])) out.push(label.toLowerCase());
      }
      const docs = Array.isArray(collected.documentos) ? (collected.documentos as string[]) : [];
      if (!docs.some((d) => /comprovante/i.test(d)) && !attachmentTypes.includes('document')) {
        out.push('comprovante de residência');
      }
      if (out.length === 0) out.push('confirmar dados e seguir para finalização');
    } else if (intent === 'SUPPORT') {
      if (!attachmentTypes.some((t) => t === 'video' || t === 'image')) {
        out.push('evidência (vídeo/foto dos LEDs)');
      } else {
        out.push('validar status na ISPBOX');
      }
    } else if (intent === 'FINANCIAL') {
      if (this.mentions(messages, /\bpix\b|boleto/i)) out.push('confirmação do pagamento');
      else out.push('enviar 2ª via / PIX');
    }
    return out;
  }

  private buildNextStep(
    intent: string,
    pending: string[],
    ticket: { status?: string } | undefined,
    collected: Record<string, unknown>,
    messages: { role: string; content: string }[],
  ): string {
    if (intent === 'COMMERCIAL') {
      if (pending.some((p) => /comprovante|documento|cpf|rg|telefone|nome|e-mail|endereço/i.test(p))) {
        return 'Solicitar os documentos/dados pendentes e confirmar o melhor horário para a instalação.';
      }
      return 'Confirmar os dados coletados e encaminhar para a finalização do cadastro.';
    }
    if (intent === 'SUPPORT') {
      if (ticket) return 'Validar o status na ISPBOX e encaminhar para o técnico se persistir offline.';
      return 'Registrar a ocorrência e solicitar evidências (vídeo dos LEDs do roteador/ONU).';
    }
    if (intent === 'FINANCIAL') {
      if (this.mentions(messages, /\bpix\b/i)) return 'Confirmar o recebimento do comprovante ou aguardar a baixa do pagamento.';
      return 'Enviar a 2ª via/PIX e acompanhar a confirmação do pagamento.';
    }
    return 'Revisar o histórico e dar continuidade ao atendimento.';
  }

  private buildSituation(
    intent: string,
    status: string,
    ticket: { status?: string } | undefined,
    collected: Record<string, unknown>,
    messages: { role: string; content: string }[],
  ): string {
    if (intent === 'SUPPORT') {
      if (this.mentions(messages, /sem (internet|conex[ãa]o)|offline|sem sinal/i)) return 'Cliente relata sem conexão.';
      return ticket ? 'Chamado de suporte em andamento.' : 'Solicitação de suporte recebida.';
    }
    if (intent === 'FINANCIAL') {
      if (this.mentions(messages, /vencid|atras/i)) return 'Cobrança vencida em aberto.';
      return 'Solicitação financeira em andamento.';
    }
    if (intent === 'COMMERCIAL') {
      if (has(collected.plano)) return `Contratação em andamento (plano ${String(collected.plano)}).`;
      return 'Lead comercial em qualificação.';
    }
    return status === 'HUMAN' ? 'Aguardando atendimento humano.' : 'Conversa em andamento.';
  }

  private buildUrgency(
    hq: { priority?: string; dueAt?: Date | null; status?: string } | null,
    status: string,
  ): CopilotUrgency {
    if (hq) {
      const sla = slaStatusOf(hq as never);
      if (sla === 'overdue' || hq.priority === 'URGENT') return 'urgent';
      if (sla === 'due_soon' || hq.priority === 'HIGH') return 'high';
      return 'normal';
    }
    return status === 'HUMAN' ? 'normal' : 'low';
  }

  private mentions(messages: { content: string }[], re: RegExp): boolean {
    return messages.some((m) => re.test(m.content ?? ''));
  }
}

function has(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function friendlyStatus(s?: string): string {
  const map: Record<string, string> = { OPEN: 'aberto', IN_PROGRESS: 'em andamento', RESOLVED: 'resolvido', CLOSED: 'fechado' };
  return s ? map[s] ?? s.toLowerCase() : 'aberto';
}
