import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';

export interface KnowledgeActor {
  userId: string;
  companyId: string;
}

export interface KnowledgeFilters {
  category?: string;
  active?: boolean;
  search?: string;
}

export interface UpsertArticle {
  category: string;
  title: string;
  content: string;
  active?: boolean;
}

/**
 * CRUD da base de conhecimento (KnowledgeArticle). Leitura vê o conteúdo da
 * empresa + o conteúdo global (companyId null). Escrita exige ADMIN/MANAGER
 * (RBAC no controller) e registra auditoria.
 */
@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  private tenant(companyId: string): Prisma.KnowledgeArticleWhereInput {
    return { OR: [{ companyId: null }, { companyId }] };
  }

  list(filters: KnowledgeFilters, companyId: string) {
    const term = filters.search?.trim();
    return this.prisma.knowledgeArticle.findMany({
      where: {
        ...this.tenant(companyId),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.active !== undefined ? { active: filters.active } : {}),
        ...(term
          ? {
              OR: [
                { title: { contains: term, mode: 'insensitive' as const } },
                { content: { contains: term, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
  }

  /** Categorias distintas (para o filtro do painel). */
  async categories(companyId: string): Promise<string[]> {
    const rows = await this.prisma.knowledgeArticle.findMany({
      where: this.tenant(companyId),
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category).filter((c): c is string => !!c);
  }

  async get(id: string, companyId: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!article || (article.companyId && article.companyId !== companyId)) {
      throw new NotFoundException('Artigo não encontrado');
    }
    return article;
  }

  async create(dto: UpsertArticle, actor: KnowledgeActor) {
    const article = await this.prisma.knowledgeArticle.create({
      data: {
        companyId: actor.companyId, // companyId obrigatório
        category: dto.category,
        title: dto.title,
        content: dto.content,
        active: dto.active ?? true,
      },
    });
    await this.audit.record({
      companyId: actor.companyId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'knowledge.create',
      entityType: 'knowledge_article',
      entityId: article.id,
      metadata: { category: article.category, title: article.title },
    });
    return article;
  }

  async update(id: string, dto: Partial<UpsertArticle>, actor: KnowledgeActor) {
    await this.assertWritable(id, actor.companyId);
    const article = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: {
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    await this.audit.record({
      companyId: actor.companyId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'knowledge.update',
      entityType: 'knowledge_article',
      entityId: id,
      metadata: { active: article.active },
    });
    return article;
  }

  async remove(id: string, actor: KnowledgeActor) {
    await this.assertWritable(id, actor.companyId);
    await this.prisma.knowledgeArticle.delete({ where: { id } });
    await this.audit.record({
      companyId: actor.companyId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'knowledge.delete',
      entityType: 'knowledge_article',
      entityId: id,
    });
    return { id, deleted: true };
  }

  /** Permite editar/remover artigos da própria empresa ou globais (null). */
  private async assertWritable(id: string, companyId: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Artigo não encontrado');
    if (article.companyId && article.companyId !== companyId) {
      throw new ForbiddenException('Artigo de outra empresa.');
    }
  }
}
