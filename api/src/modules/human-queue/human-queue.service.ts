import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationStatus,
  HumanQueue,
  HumanQueueReason,
  HumanQueueStatus,
  Priority,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EVENTS, EventsService } from '../../common/events/events.service';
import { ConversationsService } from '../conversations/conversations.service';

export interface HumanQueueFilters {
  status?: HumanQueueStatus;
  reason?: HumanQueueReason;
  assignedUserId?: string;
  priority?: Priority;
  search?: string;
  page?: number;
  limit?: number;
}

export type SlaStatus = 'on_time' | 'due_soon' | 'overdue' | 'resolved';

/** Minutos entre criação e primeira resposta humana (null se ainda sem resposta). */
export function firstResponseMinutesOf(item: HumanQueue): number | null {
  if (!item.firstResponseAt) return null;
  return Math.round((item.firstResponseAt.getTime() - item.createdAt.getTime()) / 60_000);
}

/** Calcula prioridade e prazo (dueAt) do handoff. */
export function computeSla(
  reason: HumanQueueReason,
  intent?: string | null,
  now: Date = new Date(),
): { priority: Priority; dueAt: Date } {
  let minutes = 15;
  let priority: Priority = Priority.NORMAL;

  if (reason === HumanQueueReason.API_ERROR) {
    minutes = 5;
    priority = Priority.URGENT;
  } else if (intent === 'FINANCIAL') {
    minutes = 15;
    priority = Priority.HIGH;
  } else if (intent === 'SUPPORT') {
    minutes = 10;
  } else if (intent === 'COMMERCIAL') {
    minutes = 20;
  }
  return { priority, dueAt: new Date(now.getTime() + minutes * 60_000) };
}

export function slaStatusOf(item: HumanQueue, now: Date = new Date()): SlaStatus {
  if (item.status === HumanQueueStatus.RESOLVED) return 'resolved';
  if (!item.dueAt) return 'on_time';
  const remaining = item.dueAt.getTime() - now.getTime();
  if (remaining < 0) return 'overdue';
  if (remaining < 5 * 60_000) return 'due_soon';
  return 'on_time';
}

@Injectable()
export class HumanQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly audit: AuditLogService,
    private readonly events: EventsService,
  ) {}

  async enqueue(params: {
    conversationId: string;
    reason: HumanQueueReason;
    summary?: string;
    intent?: string | null;
    companyId?: string | null;
  }) {
    const { priority, dueAt } = computeSla(params.reason, params.intent);
    const entry = await this.prisma.humanQueue.create({
      data: {
        conversationId: params.conversationId,
        reason: params.reason,
        summary: params.summary,
        status: HumanQueueStatus.WAITING,
        priority,
        dueAt,
      },
    });
    await this.conversations.setStatus(params.conversationId, ConversationStatus.HUMAN);
    await this.audit.record({
      actorType: 'system',
      action: 'human.handoff',
      entityType: 'conversation',
      entityId: params.conversationId,
      metadata: { reason: params.reason, humanQueueId: entry.id, priority },
    });
    this.events.emit(params.companyId, EVENTS.HUMAN_QUEUE_UPDATED, { id: entry.id });
    return entry;
  }

  async list(companyId: string, filters: HumanQueueFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const term = filters.search?.trim();
    const where = {
      conversation: {
        companyId,
        ...(term
          ? {
              OR: [
                { contact: { contains: term, mode: 'insensitive' as const } },
                { customer: { name: { contains: term, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.reason ? { reason: filters.reason } : {}),
      ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.humanQueue.findMany({
        where,
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        include: { conversation: { include: { customer: true } } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.humanQueue.count({ where }),
    ]);
    const now = new Date();
    const data = items.map((i) => ({
      ...i,
      slaStatus: slaStatusOf(i, now),
      firstResponseMinutes: firstResponseMinutesOf(i),
    }));
    return { data, total, page, limit };
  }

  private async loadScoped(id: string, companyId: string) {
    const entry = await this.prisma.humanQueue.findUnique({
      where: { id },
      include: { conversation: true },
    });
    if (!entry) throw new NotFoundException('Item não encontrado');
    if (entry.conversation.companyId && entry.conversation.companyId !== companyId) {
      throw new ForbiddenException('Acesso negado (empresa).');
    }
    return entry;
  }

  async assign(id: string, userId: string, companyId: string, actorId: string) {
    await this.loadScoped(id, companyId);
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.companyId !== companyId) {
      throw new BadRequestException('Atendente inválido para esta empresa.');
    }
    const updated = await this.prisma.humanQueue.update({
      where: { id },
      data: { assignedUserId: userId, status: HumanQueueStatus.ASSIGNED },
    });
    await this.audit.record({
      companyId, actorType: 'user', actorId,
      action: 'human_queue.assign', entityType: 'human_queue', entityId: id,
      metadata: { assignedUserId: userId },
    });
    this.events.emit(companyId, EVENTS.HUMAN_QUEUE_UPDATED, { id });
    return updated;
  }

  async resolve(id: string, companyId: string, actorId: string) {
    await this.loadScoped(id, companyId);
    const updated = await this.prisma.humanQueue.update({
      where: { id },
      data: { status: HumanQueueStatus.RESOLVED, resolvedAt: new Date() },
    });
    await this.audit.record({
      companyId, actorType: 'user', actorId,
      action: 'human_queue.resolve', entityType: 'human_queue', entityId: id,
    });
    this.events.emit(companyId, EVENTS.HUMAN_QUEUE_UPDATED, { id });
    return updated;
  }

  async reopen(id: string, companyId: string, actorId: string) {
    await this.loadScoped(id, companyId);
    const updated = await this.prisma.humanQueue.update({
      where: { id },
      data: { status: HumanQueueStatus.WAITING, assignedUserId: null, resolvedAt: null },
    });
    await this.audit.record({
      companyId, actorType: 'user', actorId,
      action: 'human_queue.reopen', entityType: 'human_queue', entityId: id,
    });
    this.events.emit(companyId, EVENTS.HUMAN_QUEUE_UPDATED, { id });
    return updated;
  }
}
