import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolve a empresa (tenant) padrão. Enquanto o multi-tenant não tem
 * autenticação/seleção de empresa por requisição, todas as entidades que
 * exigem `companyId` usam a empresa padrão garantida aqui.
 */
@Injectable()
export class CompanyService {
  private cachedId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Garante (e cacheia) a empresa padrão, retornando seu id. */
  async getDefaultCompanyId(): Promise<string> {
    if (this.cachedId) return this.cachedId;

    const name = this.config.get<string>('company.defaultName') ?? 'CentralIA';
    // 1) empresa pelo nome configurado; 2) senão, a empresa existente mais antiga
    //    (NUNCA criar um segundo tenant quando já existe um — isso fazia conversas
    //     de webhook caírem numa empresa diferente da dos operadores: BUG-01);
    // 3) só cria quando o banco está realmente vazio.
    const company =
      (await this.prisma.company.findFirst({ where: { name } })) ??
      (await this.prisma.company.findFirst({ orderBy: { createdAt: 'asc' } })) ??
      (await this.prisma.company.create({ data: { name } }));

    this.cachedId = company.id;
    return company.id;
  }
}
