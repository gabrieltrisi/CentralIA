import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationStatus,
  HumanQueueStatus,
  MessageRole,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyService } from '../../common/company/company.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EVENTS, EventsService } from '../../common/events/events.service';
import { MediaKind } from '../../common/storage/file-security.service';
import { MetaWhatsappSenderService } from '../meta-whatsapp/meta-whatsapp-sender.service';
import { MetaWhatsappMediaService } from '../meta-whatsapp/meta-whatsapp-media.service';

interface Actor {
  userId: string;
  role: UserRole;
  companyId: string;
}

const AREA_INTENT: Partial<Record<UserRole, string>> = {
  [UserRole.SUPPORT]: 'SUPPORT',
  [UserRole.FINANCIAL]: 'FINANCIAL',
  [UserRole.COMMERCIAL]: 'COMMERCIAL',
};

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly company: CompanyService,
    private readonly audit: AuditLogService,
    private readonly sender: MetaWhatsappSenderService,
    private readonly media: MetaWhatsappMediaService,
    private readonly events: EventsService,
  ) {}

  /** Filtro de visibilidade por papel (RBAC fino). */
  private scopeForRole(actor: Actor, status?: ConversationStatus): Prisma.ConversationWhereInput {
    const base: Prisma.ConversationWhereInput = {
      companyId: actor.companyId,
      ...(status ? { status } : {}),
    };
    if (actor.role === UserRole.ADMIN || actor.role === UserRole.MANAGER) return base;
    if (actor.role === UserRole.AGENT) {
      return { ...base, OR: [{ assignedUserId: actor.userId }, { assignedUserId: null }] };
    }
    const intent = AREA_INTENT[actor.role];
    if (intent) {
      return { ...base, OR: [{ intent }, { assignedUserId: actor.userId }] };
    }
    return base;
  }

  async findAll(
    actor: Actor,
    opts: { status?: ConversationStatus; search?: string; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const where = this.withSearch(this.scopeForRole(actor, opts.status), opts.search);

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
        include: { customer: true },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const reads = await this.prisma.conversationRead.findMany({
      where: { userId: actor.userId, conversationId: { in: conversations.map((c) => c.id) } },
    });
    const readMap = new Map(reads.map((r) => [r.conversationId, r.lastReadAt]));

    const data = conversations.map((c) => {
      const read = readMap.get(c.id);
      const unread = !!c.lastMessageAt && (!read || c.lastMessageAt > read);
      return { ...c, unread };
    });
    return { data, total, page, limit };
  }

  /** Aplica busca por nome do cliente / contato (telefone). */
  private withSearch(
    base: Prisma.ConversationWhereInput,
    search?: string,
  ): Prisma.ConversationWhereInput {
    const term = search?.trim();
    if (!term) return base;
    const like = { contains: term, mode: 'insensitive' as const };
    return {
      AND: [
        base,
        { OR: [{ contact: like }, { customer: { name: like } }, { customer: { cpfCnpj: like } }] },
      ],
    };
  }

  async findOne(id: string, companyId?: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: true, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    if (companyId && conversation.companyId && conversation.companyId !== companyId) {
      throw new ForbiddenException('Acesso negado (empresa).');
    }
    return conversation;
  }

  async getDetail(id: string, companyId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: { include: { services: true } },
        messages: { orderBy: { createdAt: 'asc' } },
        attachments: { orderBy: { createdAt: 'asc' } },
        assignedUser: { select: { id: true, name: true, email: true, role: true } },
        tickets: { orderBy: { createdAt: 'desc' }, include: { workOrders: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    if (conversation.companyId && conversation.companyId !== companyId) {
      throw new ForbiddenException('Acesso negado (empresa).');
    }
    const fsm = await this.prisma.conversationState.findUnique({ where: { conversationId: id } });
    return {
      ...conversation,
      fsm: fsm ? { state: fsm.state, collectedData: fsm.collectedData ?? {} } : null,
    };
  }

  getHistory(conversationId: string) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOrCreateByContact(contact: string, customerId?: string, companyId?: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: { contact, status: { not: ConversationStatus.CLOSED } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;
    const resolvedCompany = companyId ?? (await this.company.getDefaultCompanyId());
    return this.prisma.conversation.create({
      data: { contact, customerId, companyId: resolvedCompany, status: ConversationStatus.BOT },
    });
  }

  /** Define a intenção detectada pela IA/FSM (para roteamento por área). */
  setIntent(id: string, intent: string) {
    return this.prisma.conversation.update({ where: { id }, data: { intent } });
  }

  async addMessage(params: {
    conversationId: string;
    role: MessageRole;
    content: string;
    externalId?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const now = new Date();
    const [message, conversation] = await this.prisma.$transaction([
      this.prisma.message.create({ data: params }),
      this.prisma.conversation.update({
        where: { id: params.conversationId },
        data: { lastMessageAt: now, updatedAt: now },
      }),
    ]);
    // Payload mínimo (apenas ids + papel): o cliente recarrega via API com RBAC.
    // Nunca difundir o conteúdo da mensagem para toda a sala da empresa.
    this.events.emit(conversation.companyId, EVENTS.MESSAGE_CREATED, {
      conversationId: params.conversationId,
      messageId: message.id,
      role: message.role,
    });
    this.events.emit(conversation.companyId, EVENTS.CONVERSATION_UPDATED, {
      conversationId: params.conversationId,
    });
    return message;
  }

  setStatus(id: string, status: ConversationStatus) {
    return this.prisma.conversation.update({ where: { id }, data: { status } });
  }

  /** Marca a conversa como lida pelo usuário. */
  async markRead(id: string, actor: Actor) {
    await this.findOne(id, actor.companyId);
    return this.prisma.conversationRead.upsert({
      where: { conversationId_userId: { conversationId: id, userId: actor.userId } },
      create: { conversationId: id, userId: actor.userId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
  }

  /** Auto-atribui ao atendente quando a conversa está sem dono. */
  private async autoAssign(conversation: { id: string; companyId: string | null; assignedUserId: string | null }, actor: Actor) {
    if (conversation.assignedUserId) return;
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { assignedUserId: actor.userId },
    });
    await this.prisma.humanQueue.updateMany({
      where: { conversationId: conversation.id, status: HumanQueueStatus.WAITING },
      data: { assignedUserId: actor.userId, status: HumanQueueStatus.ASSIGNED },
    });
    await this.audit.record({
      companyId: actor.companyId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'conversation.auto_assign',
      entityType: 'conversation',
      entityId: conversation.id,
    });
    this.events.emit(conversation.companyId, EVENTS.HUMAN_QUEUE_UPDATED, { conversationId: conversation.id });
  }

  /**
   * Marca a primeira resposta humana (firstResponseAt) nos itens de fila ainda
   * sem resposta — base para a métrica de tempo de primeira resposta (SLA).
   */
  private async recordFirstResponse(conversationId: string) {
    await this.prisma.humanQueue.updateMany({
      where: {
        conversationId,
        firstResponseAt: null,
        status: { not: HumanQueueStatus.RESOLVED },
      },
      data: { firstResponseAt: new Date() },
    });
  }

  private assertCanReply(conversation: { status: ConversationStatus }, actor: Actor) {
    if (
      conversation.status === ConversationStatus.CLOSED &&
      actor.role !== UserRole.ADMIN &&
      actor.role !== UserRole.MANAGER
    ) {
      throw new ForbiddenException('Conversa finalizada — apenas ADMIN/MANAGER podem responder.');
    }
  }

  async sendManualMessage(id: string, content: string, actor: Actor) {
    const conversation = await this.findOne(id, actor.companyId);
    this.assertCanReply(conversation, actor);
    await this.autoAssign(conversation, actor);

    const message = await this.addMessage({
      conversationId: id,
      role: MessageRole.AGENT,
      content,
      metadata: { sentBy: actor.userId },
    });
    await this.recordFirstResponse(id);

    let delivery: unknown = null;
    if (conversation.contact) delivery = await this.sender.sendText(conversation.contact, content);

    await this.audit.record({
      companyId: actor.companyId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'conversation.message.send',
      entityType: 'conversation',
      entityId: id,
    });
    return { message, delivery };
  }

  /** Envia um anexo (imagem/PDF) do atendente. */
  async sendAttachment(
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
    caption: string | undefined,
    actor: Actor,
  ) {
    const conversation = await this.findOne(id, actor.companyId);
    this.assertCanReply(conversation, actor);

    const kind: MediaKind = file.mimetype.startsWith('image/')
      ? 'image'
      : file.mimetype === 'application/pdf'
        ? 'document'
        : (() => {
            throw new BadRequestException('Tipo não suportado (apenas imagem ou PDF).');
          })();

    await this.autoAssign(conversation, actor);

    const attachment = await this.media.ingestUploaded({
      conversationId: id,
      buffer: file.buffer,
      mimeType: file.mimetype,
      filename: file.originalname,
      type: kind,
    });

    const message = await this.addMessage({
      conversationId: id,
      role: MessageRole.AGENT,
      content: caption || `[${kind}]`,
      metadata: { type: kind, attachmentId: attachment.id, sentBy: actor.userId },
    });
    await this.recordFirstResponse(id);

    let delivery: unknown = null;
    if (conversation.contact) {
      delivery =
        kind === 'image'
          ? await this.sender.sendImage(conversation.contact, attachment.url, caption)
          : await this.sender.sendDocument(conversation.contact, attachment.url, attachment.filename ?? 'arquivo.pdf', caption);
    }

    await this.audit.record({
      companyId: actor.companyId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'conversation.attachment.send',
      entityType: 'conversation',
      entityId: id,
      metadata: { attachmentId: attachment.id, kind },
    });
    return { message, attachment, delivery };
  }

  private async assertSameCompanyUser(userId: string, companyId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.companyId !== companyId) {
      throw new BadRequestException('Atendente inválido para esta empresa.');
    }
  }

  async assign(id: string, assignedUserId: string, companyId: string) {
    const conv = await this.findOne(id, companyId);
    await this.assertSameCompanyUser(assignedUserId, companyId);
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: { assignedUserId },
    });
    this.events.emit(conv.companyId, EVENTS.CONVERSATION_UPDATED, { conversationId: id });
    return updated;
  }

  async close(id: string, companyId: string) {
    const conv = await this.findOne(id, companyId);
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: { status: ConversationStatus.CLOSED },
    });
    this.events.emit(conv.companyId, EVENTS.CONVERSATION_UPDATED, { conversationId: id });
    return updated;
  }

  async reopen(id: string, companyId: string) {
    const conv = await this.findOne(id, companyId);
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: { status: ConversationStatus.PENDING },
    });
    this.events.emit(conv.companyId, EVENTS.CONVERSATION_UPDATED, { conversationId: id });
    return updated;
  }

  linkCustomer(id: string, customerId: string) {
    return this.prisma.conversation.update({ where: { id }, data: { customerId } });
  }
}
