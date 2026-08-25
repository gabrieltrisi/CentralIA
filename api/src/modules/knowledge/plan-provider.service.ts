import { Injectable } from '@nestjs/common';
import { KnowledgeArticle } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface Plan {
  name: string;
  speedMbps?: number;
  priceBRL?: number;
  description: string;
  recommended: boolean;
}

export const PLAN_CATEGORIES = {
  FIBER: 'COMERCIAL_PLANOS_FIBRA',
  MOBILE: 'COMERCIAL_PLANOS_MOVEL',
} as const;

/**
 * Fonte única dos planos comerciais, lida da base de conhecimento
 * (KnowledgeArticle). Faz o parse de velocidade/preço a partir do título e do
 * conteúdo, de modo que os planos permaneçam editáveis pelo painel (/knowledge).
 */
@Injectable()
export class PlanProviderService {
  constructor(private readonly prisma: PrismaService) {}

  private tenant(companyId?: string) {
    return companyId ? { OR: [{ companyId: null }, { companyId }] } : { companyId: null };
  }

  private async load(category: string, companyId?: string): Promise<Plan[]> {
    const rows = await this.prisma.knowledgeArticle.findMany({
      where: { category, active: true, ...this.tenant(companyId) },
      orderBy: { title: 'asc' },
    });
    return rows.map((r) => this.parse(r)).sort((a, b) => (a.priceBRL ?? 0) - (b.priceBRL ?? 0));
  }

  getFiberPlans(companyId?: string): Promise<Plan[]> {
    return this.load(PLAN_CATEGORIES.FIBER, companyId);
  }

  getMobilePlans(companyId?: string): Promise<Plan[]> {
    return this.load(PLAN_CATEGORIES.MOBILE, companyId);
  }

  /**
   * Plano de fibra recomendado: o marcado com `[recomendado]` no conteúdo; senão
   * o de preço mediano (bom custo-benefício). `cep` é aceito para futura
   * recomendação por viabilidade.
   */
  async getRecommendedFiberPlan(companyId?: string, _cep?: string): Promise<Plan | null> {
    const plans = await this.getFiberPlans(companyId);
    if (plans.length === 0) return null;
    const flagged = plans.find((p) => p.recommended);
    if (flagged) return flagged;
    return plans[Math.floor((plans.length - 1) / 2)]; // mediano por preço
  }

  /** Texto amigável com a lista de planos para o cliente. */
  formatPlansForCustomer(plans: Plan[]): string {
    if (plans.length === 0) return 'No momento não há planos cadastrados.';
    return plans
      .map((p) => {
        const price = p.priceBRL != null ? `R$ ${p.priceBRL.toFixed(2).replace('.', ',')}` : 'consultar';
        const star = p.recommended ? ' ⭐' : '';
        return `• ${p.name} — ${price}${star}`;
      })
      .join('\n');
  }

  /** Extrai velocidade (Mbps) e preço (BRL) do artigo. */
  private parse(article: KnowledgeArticle): Plan {
    const title = article.title ?? '';
    const content = article.content ?? '';

    // Velocidade: "400 MEGA" → 400 ; "1 GIGA" → 1000.
    let speedMbps: number | undefined;
    const speedMatch = `${title} ${content}`.match(/(\d+(?:[.,]\d+)?)\s*(mega|giga|gb)/i);
    if (speedMatch) {
      const value = parseFloat(speedMatch[1].replace(',', '.'));
      speedMbps = /giga/i.test(speedMatch[2]) ? value * 1000 : value;
    }

    // Preço: "R$ 99,90" → 99.90.
    let priceBRL: number | undefined;
    const priceMatch = content.match(/R\$\s*([\d.]+,\d{2}|\d+)/i);
    if (priceMatch) {
      priceBRL = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    return {
      name: title,
      speedMbps,
      priceBRL,
      description: content.replace(/\[recomendado\]/i, '').trim(),
      recommended: /\[recomendado\]/i.test(content),
    };
  }
}
