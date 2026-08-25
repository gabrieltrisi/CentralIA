import { Injectable } from '@nestjs/common';
import { KnowledgeArticle } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Acesso à base de conhecimento (KnowledgeArticle). Substitui textos
 * hard-coded nos agentes/fluxos por conteúdo configurável.
 */
@Injectable()
export class KnowledgeProviderService {
  constructor(private readonly prisma: PrismaService) {}

  /** Conteúdo da empresa (companyId) somado ao conteúdo global (companyId null). */
  private tenant(companyId?: string) {
    return companyId
      ? { OR: [{ companyId: null }, { companyId }] }
      : { companyId: null };
  }

  findByCategory(category: string, companyId?: string): Promise<KnowledgeArticle[]> {
    return this.prisma.knowledgeArticle.findMany({
      where: { category, active: true, ...this.tenant(companyId) },
      orderBy: { title: 'asc' },
    });
  }

  /** Planos por tipo de serviço (fibra|movel). */
  async findPlansByServiceType(
    type: 'fibra' | 'movel',
    companyId?: string,
  ): Promise<KnowledgeArticle | null> {
    const titleNeedle = type === 'fibra' ? 'Fibra' : 'Móvel';
    return this.prisma.knowledgeArticle.findFirst({
      where: { category: 'COMERCIAL', active: true, title: { contains: titleNeedle }, ...this.tenant(companyId) },
    });
  }

  /** Procedimento de suporte por palavra-chave do problema. */
  async findSupportProcedure(issue: string, companyId?: string): Promise<KnowledgeArticle | null> {
    const needle =
      /sinal|los|onu/i.test(issue) ? 'ONU' :
      /lent|velocidade/i.test(issue) ? 'Lentidão' :
      'Sem conexão';
    return this.prisma.knowledgeArticle.findFirst({
      where: { category: 'SUPORTE_PROCEDIMENTOS', active: true, title: { contains: needle }, ...this.tenant(companyId) },
    });
  }

  /** Procedimento financeiro por intenção (pix|2via|desbloqueio). */
  async findFinancialProcedure(intent: string, companyId?: string): Promise<KnowledgeArticle | null> {
    const needle =
      /pix/i.test(intent) ? 'PIX' :
      /desbloqueio|confian/i.test(intent) ? 'Desbloqueio' :
      'Segunda via';
    return this.prisma.knowledgeArticle.findFirst({
      where: { category: 'FINANCEIRO_PROCEDIMENTOS', active: true, title: { contains: needle }, ...this.tenant(companyId) },
    });
  }
}
