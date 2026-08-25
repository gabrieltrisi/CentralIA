import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { KnowledgeService } from './knowledge.service';

const ACTOR = { userId: 'u1', companyId: 'comp-1' };

function makeService(article: any = { id: 'a1', companyId: 'comp-1', category: 'FAQ', title: 'T', content: 'C', active: true }) {
  const prisma = {
    knowledgeArticle: {
      findMany: jest.fn().mockResolvedValue([article]),
      findUnique: jest.fn().mockResolvedValue(article),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'new', ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 'a1', ...article, ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  return { svc: new KnowledgeService(prisma, audit), prisma, audit };
}

describe('KnowledgeService — CRUD + RBAC de empresa + auditoria', () => {
  it('list escopa para empresa + global', async () => {
    const { svc, prisma } = makeService();
    await svc.list({ category: 'FAQ' }, 'comp-1');
    const arg = (prisma.knowledgeArticle.findMany as jest.Mock).mock.calls[0][0];
    expect(arg.where.OR).toEqual([{ companyId: null }, { companyId: 'comp-1' }]);
    expect(arg.where.category).toBe('FAQ');
  });

  it('create define companyId do ator e audita', async () => {
    const { svc, prisma, audit } = makeService();
    const res = await svc.create({ category: 'FAQ', title: 'X', content: 'Y' }, ACTOR);
    expect((prisma.knowledgeArticle.create as jest.Mock).mock.calls[0][0].data.companyId).toBe('comp-1');
    expect((res as any).active).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'knowledge.create' }));
  });

  it('update ativa/desativa e audita', async () => {
    const { svc, audit } = makeService();
    await svc.update('a1', { active: false }, ACTOR);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'knowledge.update' }));
  });

  it('delete remove e audita', async () => {
    const { svc, prisma, audit } = makeService();
    await svc.remove('a1', ACTOR);
    expect(prisma.knowledgeArticle.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'knowledge.delete' }));
  });

  it('bloqueia editar artigo de outra empresa', async () => {
    const { svc } = makeService({ id: 'a1', companyId: 'outra', category: 'FAQ', title: 'T', content: 'C', active: true });
    await expect(svc.update('a1', { title: 'z' }, ACTOR)).rejects.toThrow(ForbiddenException);
  });

  it('permite editar artigo global (companyId null)', async () => {
    const { svc, audit } = makeService({ id: 'a1', companyId: null, category: 'FAQ', title: 'T', content: 'C', active: true });
    await svc.update('a1', { title: 'z' }, ACTOR);
    expect(audit.record).toHaveBeenCalled();
  });

  it('get 404 para artigo inexistente', async () => {
    const { svc, prisma } = makeService();
    (prisma.knowledgeArticle.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(svc.get('x', 'comp-1')).rejects.toThrow(NotFoundException);
  });
});
