import { Injectable } from '@nestjs/common';
import { ConversationStateValue as S } from '@prisma/client';
import { CustomersService } from '../../../customers/customers.service';
import { IspboxService } from '../../../ispbox/ispbox.service';
import { IspboxMapperService, NormalizedCharge } from '../../../ispbox/ispbox-mapper.service';
import { IspboxActionsService, ActionActor } from '../../../ispbox/ispbox-actions.service';
import { DataExtractorService } from '../data-extractor.service';
import { FsmFlow, StateHandler } from '../flow.types';
import { OutboundMessage } from '../../ai.types';

/**
 * Fluxo Financeiro funcional: identificação (local → ISPBOX) → serviços →
 * cobranças (abertas/vencidas/pagas) → PIX/PDF guardados por flag → resumo.
 */
@Injectable()
export class FinancialFlow implements FsmFlow {
  constructor(
    private readonly customers: CustomersService,
    private readonly ispbox: IspboxService,
    private readonly mapper: IspboxMapperService,
    private readonly actions: IspboxActionsService,
    private readonly extractor: DataExtractorService,
  ) {}

  handlers(): Partial<Record<S, StateHandler>> {
    return {
      [S.FINANCIAL_IDENTIFICATION]: this.identification,
      [S.FINANCIAL_SERVICE_LOOKUP]: this.serviceLookup,
      [S.FINANCIAL_BILLING_LIST]: this.billingList,
      [S.FINANCIAL_PAYMENT_OPTIONS]: this.paymentOptions,
      [S.FINANCIAL_SUMMARY]: this.summary,
    };
  }

  private actorOf(agent: { contact?: string | null; customer?: { companyId?: string | null } | null }): ActionActor {
    return { actorType: 'system', companyId: agent.customer?.companyId ?? undefined, phone: agent.contact ?? undefined };
  }

  private identification: StateHandler = async (state, agent) => {
    if (agent.customer) {
      this.remember(state, agent.customer);
      return { goto: S.FINANCIAL_SERVICE_LOOKUP };
    }
    const cpf = this.extractor.extractCpf(agent.lastUserMessage);
    const lookup = await this.customers.resolveCustomer({ phone: agent.contact, cpf });

    if (lookup.source === 'ispbox-multiple') {
      return { reply: 'Encontrei mais de um cadastro com esses dados. Pode confirmar seu CPF/CNPJ completo, por favor?' };
    }
    if (!lookup.customer) {
      if (!cpf) return { reply: 'Para localizar seu cadastro, me informe seu CPF/CNPJ.' };
      return {
        reply: 'Não localizei seu cadastro com esses dados. Vou te transferir para um atendente confirmar. 🙋',
        escalateReason: 'UNKNOWN_INTENT',
        goto: S.HUMAN_HANDOFF,
      };
    }
    this.remember(state, lookup.customer);
    return { goto: S.FINANCIAL_SERVICE_LOOKUP };
  };

  private remember(state: any, customer: any) {
    state.setCollected('customerId', customer.id);
    state.setCollected('ispboxId', customer.ispboxId);
    state.setCollected('customerName', customer.name);
  }

  private serviceLookup: StateHandler = async (state, _agent, shared) => {
    const customer = await this.customers.findOne(state.getCollected<string>('customerId')!);
    shared.ispboxQueries.push('Busca de serviços ISPBOX');
    const svc = customer.services?.[0];
    if (!svc) {
      return {
        reply: 'Não encontrei serviços no seu cadastro. Vou te transferir para um atendente.',
        escalateReason: 'COMPLEX_SUPPORT',
        goto: S.HUMAN_HANDOFF,
      };
    }
    state.setCollected('serviceId', svc.ispboxServiceId);
    return { goto: S.FINANCIAL_BILLING_LIST };
  };

  private billingList: StateHandler = async (state, agent, shared) => {
    const ispboxId = state.getCollected<string>('ispboxId')!;
    const serviceId = state.getCollected<string>('serviceId')!;
    const raw = ((await this.ispbox.listCharges(ispboxId, serviceId, {})) as any[]) ?? [];
    shared.ispboxQueries.push('Listagem de cobranças');

    const charges = raw.map((c) => this.mapper.charge(c));
    const open = charges.filter((c) => c.situacao === 'open');
    const overdue = charges.filter((c) => c.situacao === 'overdue');
    const paid = charges.filter((c) => c.situacao === 'paid');
    const pending = [...overdue, ...open];

    state.setCollected('pending', pending);
    state.setCollected('billingSummary', { open: open.length, overdue: overdue.length, paid: paid.length });

    if (pending.length === 0) {
      return { reply: 'Boas notícias: você não possui cobranças em aberto. 🎉', finished: true, goto: S.FINISHED };
    }
    return { goto: S.FINANCIAL_PAYMENT_OPTIONS };
  };

  private paymentOptions: StateHandler = async (state, agent, shared) => {
    const pending = (state.getCollected<NormalizedCharge[]>('pending') ?? []) as NormalizedCharge[];
    const first = pending[0];
    const ispboxId = state.getCollected<string>('ispboxId')!;
    const serviceId = state.getCollected<string>('serviceId')!;
    const actor = this.actorOf(agent);

    const list = pending
      .map((c) => `• Cobrança ${c.id}: R$ ${c.valor ?? '—'} (venc. ${c.vencimento ?? '—'}, ${c.situacao === 'overdue' ? 'vencida' : 'aberta'})`)
      .join('\n');
    const summaryText = ['Encontrei suas cobranças:', list].join('\n');

    const outbound: OutboundMessage[] = [{ kind: 'text', text: summaryText }];
    const replyParts = [summaryText];

    // PIX + PDF guardados (sandbox simula; produção exige flag/piloto).
    const pix = await this.actions.generatePix({ ispboxId, serviceId, chargeId: String(first.id), actor });
    if (!pix.blocked && pix.copiaCola) {
      shared.ispboxQueries.push('Geração de QR Code PIX');
      replyParts.push(`PIX copia-e-cola:\n${pix.copiaCola}`);
      outbound.push({ kind: 'text', text: `PIX copia-e-cola:\n${pix.copiaCola}` });
    } else if (pix.blocked) {
      shared.ispboxQueries.push('Geração de PIX bloqueada (flag)');
    }

    const pdf = await this.actions.generatePdf({ ispboxId, serviceId, chargeId: String(first.id), actor });
    if (!pdf.blocked && pdf.url) {
      shared.ispboxQueries.push('Geração do PDF do boleto');
      outbound.push({ kind: 'document', url: pdf.url, filename: 'boleto.pdf', caption: 'Boleto para pagamento' });
    } else if (pdf.blocked) {
      shared.ispboxQueries.push('Geração de PDF bloqueada (flag)');
    }

    if (pix.blocked && pdf.blocked) {
      replyParts.push('Para gerar o PIX/boleto, um atendente vai te ajudar em instantes. 🙋');
    }

    return { reply: replyParts.filter(Boolean).join('\n'), outbound, goto: S.FINANCIAL_SUMMARY };
  };

  private summary: StateHandler = async (state) => {
    const reply =
      'Atendimento financeiro concluído. Assim que identificarmos o pagamento, o serviço é normalizado. Obrigado! 🙏';
    state.historySummary = reply;
    return { reply, finished: true, goto: S.FINISHED };
  };
}
