import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketType } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { QUEUES } from '../../queue/queues.constants';
import { IspboxActionsService, ActionActor } from '../ispbox/ispbox-actions.service';
import { IspboxAccessService } from '../ispbox/ispbox-access.service';
import { TicketsService } from '../tickets/tickets.service';

interface Actor {
  userId: string;
  companyId: string;
}

/**
 * Operações ISPBOX no contexto de uma conversa (painel do atendente). Resolve o
 * cliente da conversa e delega às ações guardadas (snapshot/PIX/PDF) e à
 * abertura de OS (com flag). Mantém ConversationsService inalterado.
 */
@Injectable()
export class ConversationIspboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actions: IspboxActionsService,
    private readonly access: IspboxAccessService,
    private readonly tickets: TicketsService,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.TICKET_PROCESSING) private readonly ticketQueue: Queue,
  ) {}

  private async load(conversationId: string, actor: Actor) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: { include: { services: true } } },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    if (conversation.companyId && conversation.companyId !== actor.companyId) {
      throw new ForbiddenException('Acesso negado (empresa).');
    }
    return conversation;
  }

  private actionActor(conversation: { companyId: string | null; contact: string | null }, actor: Actor): ActionActor {
    return { actorType: 'user', actorId: actor.userId, companyId: conversation.companyId, phone: conversation.contact };
  }

  /** Leitura consolidada (serviços + status + cobranças) para o painel. */
  async snapshot(conversationId: string, actor: Actor) {
    const conversation = await this.load(conversationId, actor);
    const customer = conversation.customer;
    if (!customer?.ispboxId) {
      return { available: false, reason: 'Cliente sem vínculo ISPBOX.' };
    }
    const snap = await this.actions.snapshot({
      ispboxId: customer.ispboxId,
      serviceId: customer.services?.[0]?.ispboxServiceId,
      actor: this.actionActor(conversation, actor),
    });
    return { ...snap, ispboxId: customer.ispboxId, customerName: customer.name };
  }

  async generatePix(conversationId: string, chargeId: string, actor: Actor) {
    const { ispboxId, serviceId, conversation } = await this.requireService(conversationId, actor);
    return this.actions.generatePix({ ispboxId, serviceId, chargeId, actor: this.actionActor(conversation, actor) });
  }

  async generatePdf(conversationId: string, chargeId: string, actor: Actor) {
    const { ispboxId, serviceId, conversation } = await this.requireService(conversationId, actor);
    return this.actions.generatePdf({ ispboxId, serviceId, chargeId, actor: this.actionActor(conversation, actor) });
  }

  /** Abre OS guardada por SUPPORT_ALLOW_OS_CREATION (sandbox simula). */
  async openOs(conversationId: string, actor: Actor) {
    const conversation = await this.load(conversationId, actor);
    const customer = conversation.customer;
    if (!customer?.ispboxId) throw new BadRequestException('Cliente sem vínculo ISPBOX.');

    const ticket = await this.tickets.create({
      type: TicketType.SUPPORT,
      summary: `OS manual — ${customer.name}`,
      customerId: customer.id,
      conversationId,
    });

    const decision = this.access.osDecision(conversation.contact);
    if (!decision.allowed) {
      await this.audit.record({
        companyId: conversation.companyId ?? undefined,
        actorType: 'user', actorId: actor.userId,
        action: 'support.os.create_blocked', entityType: 'ticket', entityId: ticket.id,
        metadata: { reason: decision.reason },
      });
      return { ticketId: ticket.id, blocked: true, reason: decision.reason };
    }

    await this.ticketQueue.add('open-os', {
      ticketId: ticket.id,
      ispboxClientId: customer.ispboxId,
      ispboxServiceId: customer.services?.[0]?.ispboxServiceId,
      tipoId: this.config.get<string>('ispbox.defaultOsTypeId'),
      assunto: 'Atendimento — abertura manual de OS',
      descricao: `Aberta pelo atendente na conversa ${conversationId}.`,
    });
    await this.audit.record({
      companyId: conversation.companyId ?? undefined,
      actorType: 'user', actorId: actor.userId,
      action: 'support.os.create', entityType: 'ticket', entityId: ticket.id,
      metadata: { simulated: decision.simulated },
    });
    return { ticketId: ticket.id, blocked: false, simulated: decision.simulated };
  }

  private async requireService(conversationId: string, actor: Actor) {
    const conversation = await this.load(conversationId, actor);
    const customer = conversation.customer;
    const ispboxId = customer?.ispboxId;
    const serviceId = customer?.services?.[0]?.ispboxServiceId;
    if (!ispboxId || !serviceId) throw new BadRequestException('Cliente sem serviço ISPBOX vinculado.');
    return { ispboxId, serviceId, conversation };
  }
}
