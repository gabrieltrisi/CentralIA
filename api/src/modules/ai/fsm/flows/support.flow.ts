import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationStateValue as S, TicketType } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AuditLogService } from '../../../../common/audit/audit-log.service';
import { QUEUES } from '../../../../queue/queues.constants';
import { CustomersService } from '../../../customers/customers.service';
import { IspboxService } from '../../../ispbox/ispbox.service';
import { IspboxMapperService } from '../../../ispbox/ispbox-mapper.service';
import { IspboxAccessService } from '../../../ispbox/ispbox-access.service';
import { TicketsService } from '../../../tickets/tickets.service';
import { KnowledgeProviderService } from '../../../knowledge/knowledge-provider.service';
import { DataExtractorService } from '../data-extractor.service';
import { FsmFlow, StateHandler } from '../flow.types';

/**
 * Fluxo de Suporte funcional: identificação (local → ISPBOX) → serviços →
 * status de internet → diagnóstico → vídeo → OS (guardada por flag) → resumo.
 */
@Injectable()
export class SupportFlow implements FsmFlow {
  constructor(
    private readonly customers: CustomersService,
    private readonly ispbox: IspboxService,
    private readonly mapper: IspboxMapperService,
    private readonly access: IspboxAccessService,
    private readonly tickets: TicketsService,
    private readonly knowledge: KnowledgeProviderService,
    private readonly extractor: DataExtractorService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
    @InjectQueue(QUEUES.TICKET_PROCESSING) private readonly ticketQueue: Queue,
  ) {}

  handlers(): Partial<Record<S, StateHandler>> {
    return {
      [S.SUPPORT_IDENTIFICATION]: this.identification,
      [S.SUPPORT_SERVICE_LOOKUP]: this.serviceLookup,
      [S.SUPPORT_STATUS_CHECK]: this.statusCheck,
      [S.SUPPORT_DIAGNOSIS]: this.diagnosis,
      [S.SUPPORT_VIDEO_REQUEST]: this.videoRequest,
      [S.SUPPORT_OS_CREATION]: this.osCreation,
      [S.SUPPORT_SUMMARY]: this.summary,
    };
  }

  private identification: StateHandler = async (state, agent) => {
    if (agent.customer) {
      this.remember(state, agent.customer);
      return { goto: S.SUPPORT_SERVICE_LOOKUP };
    }
    const cpf = this.extractor.extractCpf(agent.lastUserMessage);
    const lookup = await this.customers.resolveCustomer({ phone: agent.contact, cpf });
    if (lookup.source === 'ispbox-multiple') {
      return { reply: 'Encontrei mais de um cadastro. Pode confirmar seu CPF/CNPJ completo, por favor?' };
    }
    if (!lookup.customer) {
      if (!cpf) return { reply: 'Para te ajudar, me informe seu CPF ou o telefone cadastrado.' };
      return {
        reply: 'Não localizei seu cadastro. Vou te transferir para um atendente. 🙋',
        escalateReason: 'UNKNOWN_INTENT',
        goto: S.HUMAN_HANDOFF,
      };
    }
    this.remember(state, lookup.customer);
    return { goto: S.SUPPORT_SERVICE_LOOKUP };
  };

  private remember(state: any, customer: any) {
    state.setCollected('customerId', customer.id);
    state.setCollected('ispboxId', customer.ispboxId);
    state.setCollected('customerName', customer.name);
  }

  private serviceLookup: StateHandler = async (state, agent, shared) => {
    const customer = await this.customers.findOne(state.getCollected<string>('customerId')!);
    shared.ispboxQueries.push('Busca de serviços ISPBOX');
    await this.audit.record({
      companyId: agent.customer?.companyId ?? undefined,
      actorType: 'system', action: 'support.service.lookup',
      entityType: 'customer', entityId: customer.id,
    });
    const svc = customer.services?.[0];
    if (!svc) {
      return {
        reply: 'Não encontrei serviços ativos no seu cadastro. Vou te transferir para um atendente.',
        escalateReason: 'COMPLEX_SUPPORT',
        goto: S.HUMAN_HANDOFF,
      };
    }
    state.setCollected('serviceId', svc.ispboxServiceId);
    return { goto: S.SUPPORT_STATUS_CHECK };
  };

  private statusCheck: StateHandler = async (state, agent, shared) => {
    const raw = await this.ispbox.internetStatus(
      state.getCollected<string>('ispboxId')!,
      state.getCollected<string>('serviceId')!,
    );
    const status = this.mapper.internetStatus(raw);
    shared.ispboxQueries.push('Consulta de status da internet');
    await this.audit.record({
      companyId: agent.customer?.companyId ?? undefined,
      actorType: 'system', action: 'support.internet.status',
      entityType: 'customer', entityId: state.getCollected<string>('customerId'),
      metadata: { online: status.online },
    });
    state.setCollected('offline', !status.online);
    return { goto: !status.online ? S.SUPPORT_VIDEO_REQUEST : S.SUPPORT_DIAGNOSIS };
  };

  private diagnosis: StateHandler = async (state, agent) => {
    if (!state.hasCollected('diagAsked')) {
      state.setCollected('diagAsked', true);
      const proc = await this.knowledge.findSupportProcedure(agent.lastUserMessage);
      const steps = proc?.content ?? 'Reinicie a ONU/roteador por 30s e verifique os cabos.';
      return { reply: `${steps}\nIsso resolveu o problema? (sim/não)` };
    }
    const yn = this.extractor.extractYesNo(agent.lastUserMessage);
    if (yn === 'yes') {
      state.setCollected('resolved', true);
      return { goto: S.SUPPORT_SUMMARY };
    }
    if (yn === 'no') return { goto: S.SUPPORT_VIDEO_REQUEST };
    return { reply: 'O problema foi resolvido? Responda "sim" ou "não".' };
  };

  private videoRequest: StateHandler = async (state, agent) => {
    const media = (agent.attachments ?? []).find((a) => a.type === 'video' || a.type === 'image');

    if (!state.hasCollected('videoRequested')) {
      state.setCollected('videoRequested', true);
      if (!media) {
        return {
          reply:
            'Detectei instabilidade no seu serviço. Envie um vídeo curto mostrando os LEDs ' +
            'da sua ONU/roteador para agilizar o diagnóstico. 🎥',
        };
      }
    }

    if (media) {
      state.setCollected('videoRecebido', true);
      state.setCollected('videoAttachmentId', media.id);
      return { goto: S.SUPPORT_OS_CREATION };
    }
    return { reply: 'Fico no aguardo do vídeo ou foto dos LEDs do seu equipamento. 🎥' };
  };

  private osCreation: StateHandler = async (state, agent, shared) => {
    const ticket = await this.tickets.create({
      type: TicketType.SUPPORT,
      summary: `Sem conexão — ${state.getCollected('customerName')}`,
      customerId: state.getCollected<string>('customerId'),
      conversationId: agent.conversationId,
    });
    state.setCollected('ticketId', ticket.id);

    const videoAttachmentId = state.getCollected<string>('videoAttachmentId');
    if (videoAttachmentId) {
      await this.tickets.addEvent(ticket.id, 'media_attached', { attachmentId: videoAttachmentId });
    }

    // Abertura de OS guardada: só ocorre com SUPPORT_ALLOW_OS_CREATION (sandbox simula).
    const decision = this.access.osDecision(agent.contact);
    const companyId = agent.customer?.companyId ?? undefined;
    if (!decision.allowed) {
      state.setCollected('osBlocked', true);
      shared.ispboxQueries.push('Abertura de OS bloqueada (flag)');
      await this.audit.record({
        companyId, actorType: 'system', action: 'support.os.create_blocked',
        entityType: 'ticket', entityId: ticket.id, metadata: { reason: decision.reason },
      });
      return { goto: S.SUPPORT_SUMMARY };
    }

    await this.ticketQueue.add('open-os', {
      ticketId: ticket.id,
      ispboxClientId: state.getCollected('ispboxId'),
      ispboxServiceId: state.getCollected('serviceId'),
      tipoId: this.config.get<string>('ispbox.defaultOsTypeId'),
      assunto: 'Sem conexão de internet',
      descricao: `Aberto via atendimento (conversa ${agent.conversationId}).`,
    });
    shared.ispboxQueries.push('Abertura de OS (enfileirada)');
    await this.audit.record({
      companyId, actorType: 'system', action: 'support.os.create',
      entityType: 'ticket', entityId: ticket.id, metadata: { simulated: decision.simulated },
    });
    return { goto: S.SUPPORT_SUMMARY };
  };

  private summary: StateHandler = async (state) => {
    const resolved = state.getCollected('resolved');
    const osBlocked = state.getCollected('osBlocked');
    const reply = resolved
      ? 'Que bom que resolveu! Qualquer coisa, estou à disposição. 😊'
      : [
          'Resumo do atendimento de suporte:',
          `• Cliente: ${state.getCollected('customerName')}`,
          '• Status: instável/offline',
          `• Vídeo recebido: ${state.getCollected('videoRecebido') ? 'sim' : 'não'}`,
          `• Chamado: ${state.getCollected('ticketId') ? 'aberto' : '—'}`,
          osBlocked
            ? '• OS: será aberta por um técnico após validação.'
            : '• OS: solicitada ao sistema.',
          'Nossa equipe técnica vai atuar e você receberá atualizações por aqui. 🔧',
        ].join('\n');
    state.historySummary = reply;
    return { reply, finished: true, goto: S.FINISHED };
  };
}
