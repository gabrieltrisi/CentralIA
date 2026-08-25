import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  it('persiste o evento de auditoria', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { auditLog: { create } } as unknown as PrismaService;
    const svc = new AuditLogService(prisma);

    await svc.record({
      actorType: 'system',
      action: 'human.handoff',
      entityType: 'conversation',
      entityId: 'conv-1',
      metadata: { reason: 'NEGOTIATION' },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: 'system',
        action: 'human.handoff',
        entityId: 'conv-1',
      }),
    });
  });

  it('nunca propaga erro de persistência', async () => {
    const prisma = {
      auditLog: { create: jest.fn().mockRejectedValue(new Error('db down')) },
    } as unknown as PrismaService;
    const svc = new AuditLogService(prisma);
    await expect(svc.record({ actorType: 'system', action: 'x' })).resolves.toBeUndefined();
  });

  it('query aplica filtros, paginação e escopo de empresa', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'a1' }]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = { auditLog: { findMany, count } } as unknown as PrismaService;
    const svc = new AuditLogService(prisma);

    const res = await svc.query({
      companyId: 'comp-1',
      action: 'attachment.download',
      actorType: 'public_link',
      page: 2,
      limit: 10,
    });

    expect(res).toEqual({ data: [{ id: 'a1' }], total: 1, page: 2, limit: 10 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'comp-1', action: 'attachment.download', actorType: 'public_link' }),
        skip: 10,
        take: 10,
      }),
    );
  });
});
