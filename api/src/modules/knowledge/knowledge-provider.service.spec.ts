import { KnowledgeProviderService } from './knowledge-provider.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('KnowledgeProviderService', () => {
  const findFirst = jest.fn().mockResolvedValue({ id: '1', title: 'Planos Fibra (exemplo)' });
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    knowledgeArticle: { findFirst, findMany },
  } as unknown as PrismaService;
  const svc = new KnowledgeProviderService(prisma);

  beforeEach(() => findFirst.mockClear());

  it('findPlansByServiceType(fibra) busca artigo COMERCIAL com "Fibra"', async () => {
    await svc.findPlansByServiceType('fibra');
    expect(findFirst).toHaveBeenCalledWith({
      where: { category: 'COMERCIAL', active: true, title: { contains: 'Fibra' }, companyId: null },
    });
  });

  it('findPlansByServiceType(movel) busca "Móvel"', async () => {
    await svc.findPlansByServiceType('movel');
    expect(findFirst).toHaveBeenCalledWith({
      where: { category: 'COMERCIAL', active: true, title: { contains: 'Móvel' }, companyId: null },
    });
  });

  it('findSupportProcedure mapeia palavra-chave', async () => {
    await svc.findSupportProcedure('estou sem sinal, LOS vermelho');
    expect(findFirst).toHaveBeenCalledWith({
      where: { category: 'SUPORTE_PROCEDIMENTOS', active: true, title: { contains: 'ONU' }, companyId: null },
    });
  });

  it('findFinancialProcedure mapeia PIX', async () => {
    await svc.findFinancialProcedure('quero pagar via pix');
    expect(findFirst).toHaveBeenCalledWith({
      where: { category: 'FINANCEIRO_PROCEDIMENTOS', active: true, title: { contains: 'PIX' }, companyId: null },
    });
  });
});
