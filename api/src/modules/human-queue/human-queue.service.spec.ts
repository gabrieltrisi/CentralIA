import { ForbiddenException } from '@nestjs/common';
import { HumanQueueReason, HumanQueueStatus, Priority } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EventsService } from '../../common/events/events.service';
import { ConversationsService } from '../conversations/conversations.service';
import { HumanQueueService, computeSla, slaStatusOf } from './human-queue.service';

function makeService(entry: any) {
  const update = jest.fn().mockImplementation(({ data }) => ({ id: 'hq1', ...data }));
  const prisma = {
    humanQueue: { findUnique: jest.fn().mockResolvedValue(entry), update },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-9', companyId: 'comp-1' }) },
  } as unknown as PrismaService;
  const conversations = {} as unknown as ConversationsService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const events = { emit: jest.fn() } as unknown as EventsService;
  return { svc: new HumanQueueService(prisma, conversations, audit, events), update, audit };
}

describe('HumanQueueService (assign/resolve/reopen)', () => {
  const entry = { id: 'hq1', conversation: { companyId: 'comp-1' } };

  it('assign salva assignedUserId + ASSIGNED e audita', async () => {
    const { svc, update, audit } = makeService(entry);
    await svc.assign('hq1', 'user-9', 'comp-1', 'actor-1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'hq1' },
      data: { assignedUserId: 'user-9', status: HumanQueueStatus.ASSIGNED },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'human_queue.assign' }));
  });

  it('resolve marca RESOLVED + resolvedAt + audita', async () => {
    const { svc, update, audit } = makeService(entry);
    await svc.resolve('hq1', 'comp-1', 'actor-1');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'hq1' }, data: expect.objectContaining({ status: HumanQueueStatus.RESOLVED }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'human_queue.resolve' }));
  });

  it('reopen volta para WAITING + audita', async () => {
    const { svc, update, audit } = makeService(entry);
    await svc.reopen('hq1', 'comp-1', 'actor-1');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: HumanQueueStatus.WAITING, assignedUserId: null }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'human_queue.reopen' }));
  });

  it('bloqueia empresa diferente', async () => {
    const { svc } = makeService(entry);
    await expect(svc.resolve('hq1', 'comp-2', 'actor-1')).rejects.toThrow(ForbiddenException);
  });
});

describe('SLA helpers', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('computeSla: API_ERROR é URGENT e 5min', () => {
    const { priority, dueAt } = computeSla(HumanQueueReason.API_ERROR, null, now);
    expect(priority).toBe(Priority.URGENT);
    expect(dueAt.getTime()).toBe(now.getTime() + 5 * 60_000);
  });

  it('computeSla: FINANCIAL é HIGH e 15min', () => {
    const { priority, dueAt } = computeSla(HumanQueueReason.CLIENT_REQUEST, 'FINANCIAL', now);
    expect(priority).toBe(Priority.HIGH);
    expect(dueAt.getTime()).toBe(now.getTime() + 15 * 60_000);
  });

  it('slaStatusOf: vencido / vencendo / no prazo / resolvido', () => {
    expect(slaStatusOf({ status: HumanQueueStatus.RESOLVED, dueAt: null } as any, now)).toBe('resolved');
    expect(slaStatusOf({ status: HumanQueueStatus.WAITING, dueAt: new Date(now.getTime() - 1000) } as any, now)).toBe('overdue');
    expect(slaStatusOf({ status: HumanQueueStatus.WAITING, dueAt: new Date(now.getTime() + 2 * 60_000) } as any, now)).toBe('due_soon');
    expect(slaStatusOf({ status: HumanQueueStatus.WAITING, dueAt: new Date(now.getTime() + 30 * 60_000) } as any, now)).toBe('on_time');
  });
});
