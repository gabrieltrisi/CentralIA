import { PrismaService } from '../../prisma/prisma.service';
import { PlanProviderService } from './plan-provider.service';

const FIBER = [
  { id: '1', category: 'COMERCIAL_PLANOS_FIBRA', title: 'START 200 MEGA', content: 'R$ 69,90 — Fibra 200 Mega.', active: true },
  { id: '2', category: 'COMERCIAL_PLANOS_FIBRA', title: 'ULTRA 400 MEGA', content: 'R$ 99,90 — Fibra 400 Mega. [recomendado] custo-benefício.', active: true },
  { id: '3', category: 'COMERCIAL_PLANOS_FIBRA', title: 'GAMER 1 GIGA', content: 'R$ 159,90 — Fibra 1 Giga.', active: true },
];

function makeProvider(rows: any[]) {
  const prisma = {
    knowledgeArticle: { findMany: jest.fn().mockResolvedValue(rows) },
  } as unknown as PrismaService;
  return new PlanProviderService(prisma);
}

describe('PlanProviderService — planos reais da base', () => {
  it('getFiberPlans faz parse de velocidade e preço e ordena por preço', async () => {
    const plans = await makeProvider(FIBER).getFiberPlans();
    expect(plans.map((p) => p.name)).toEqual(['START 200 MEGA', 'ULTRA 400 MEGA', 'GAMER 1 GIGA']);
    expect(plans[0]).toMatchObject({ speedMbps: 200, priceBRL: 69.9 });
    expect(plans[2].speedMbps).toBe(1000); // 1 GIGA → 1000 Mbps
  });

  it('getRecommendedFiberPlan usa o marcado com [recomendado]', async () => {
    const rec = await makeProvider(FIBER).getRecommendedFiberPlan();
    expect(rec?.name).toBe('ULTRA 400 MEGA');
    expect(rec?.recommended).toBe(true);
  });

  it('sem [recomendado], escolhe o de preço mediano', async () => {
    const noFlag = FIBER.map((p) => ({ ...p, content: p.content.replace('[recomendado]', '') }));
    const rec = await makeProvider(noFlag).getRecommendedFiberPlan();
    expect(rec?.name).toBe('ULTRA 400 MEGA'); // mediano por preço
  });

  it('formatPlansForCustomer gera texto amigável com preço', async () => {
    const provider = makeProvider(FIBER);
    const text = provider.formatPlansForCustomer(await provider.getFiberPlans());
    expect(text).toMatch(/START 200 MEGA — R\$ 69,90/);
    expect(text).toMatch(/⭐/); // marca o recomendado
  });

  it('getFiberPlans vazio → lista vazia e texto padrão', async () => {
    const provider = makeProvider([]);
    expect(await provider.getFiberPlans()).toEqual([]);
    expect(provider.formatPlansForCustomer([])).toMatch(/não há planos/i);
  });
});
