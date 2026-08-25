import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Planos reais ChipNews — um KnowledgeArticle por plano (editável pelo painel).
// Convenção do conteúdo: "R$ <preço> — <descrição>". O título traz nome + velocidade
// (ex.: "ULTRA 400 MEGA"); o PlanProviderService faz o parse de velocidade/preço.
const ARTICLES: { category: string; title: string; content: string }[] = [
  // ----- Planos Fibra -----
  { category: 'COMERCIAL_PLANOS_FIBRA', title: 'START 200 MEGA', content: 'R$ 69,90 — Fibra 200 Mega. Wi-Fi grátis, ideal para uso básico. Instalação após validação.' },
  { category: 'COMERCIAL_PLANOS_FIBRA', title: 'FLASH 300 MEGA', content: 'R$ 89,90 — Fibra 300 Mega. Bom para streaming e home office.' },
  { category: 'COMERCIAL_PLANOS_FIBRA', title: 'ULTRA 400 MEGA', content: 'R$ 99,90 — Fibra 400 Mega. [recomendado] Melhor custo-benefício para a família.' },
  { category: 'COMERCIAL_PLANOS_FIBRA', title: 'FAST 700 MEGA', content: 'R$ 129,90 — Fibra 700 Mega. Vários dispositivos em alta velocidade.' },
  { category: 'COMERCIAL_PLANOS_FIBRA', title: 'GAMER 1 GIGA', content: 'R$ 159,90 — Fibra 1 Giga. Máxima performance para gamers e criadores.' },

  // ----- Planos Móvel -----
  { category: 'COMERCIAL_PLANOS_MOVEL', title: 'MÓVEL 20 GIGA', content: 'R$ 49,90 — 20GB + ligações ilimitadas. Portabilidade em até 3 dias úteis.' },
  { category: 'COMERCIAL_PLANOS_MOVEL', title: 'MÓVEL 40 GIGA', content: 'R$ 69,90 — 40GB + ligações ilimitadas e apps inclusos.' },

  // ----- Cobertura (lido pelo CoverageProvider) -----
  {
    category: 'COMERCIAL_COBERTURA',
    title: 'Áreas de cobertura de fibra',
    content:
      'Faixas de CEP com cobertura de fibra:\n' +
      '01000-000 a 01999-999\n' +
      '04500-000 a 04599-999\n' +
      '08000-000 a 08499-999\n' +
      'Bairros atendidos: Centro, Vila Mariana, Pinheiros, Itaquera.\n' +
      'Fora dessas faixas, oferecemos o plano Móvel.',
  },

  // ----- Procedimentos de Suporte -----
  { category: 'SUPORTE_PROCEDIMENTOS', title: 'Sem conexão', content: 'Verifique se a ONU está ligada e com o LED de fibra/PON aceso. Reinicie o equipamento por 30s.' },
  { category: 'SUPORTE_PROCEDIMENTOS', title: 'ONU sem sinal', content: 'LED LOS vermelho indica perda de sinal óptico. Confira se o cabo de fibra está bem conectado e sem dobras.' },
  { category: 'SUPORTE_PROCEDIMENTOS', title: 'Lentidão', content: 'Teste via cabo, aproxime-se do roteador, reduza dispositivos conectados e meça a velocidade em horários distintos.' },

  // ----- Procedimentos Financeiros -----
  { category: 'FINANCEIRO_PROCEDIMENTOS', title: 'Segunda via', content: 'A 2ª via pode ser gerada pelo atendimento informando CPF/CNPJ do titular.' },
  { category: 'FINANCEIRO_PROCEDIMENTOS', title: 'PIX', content: 'O pagamento via PIX é confirmado em instantes; o desbloqueio pode levar alguns minutos.' },
  { category: 'FINANCEIRO_PROCEDIMENTOS', title: 'Desbloqueio de confiança', content: 'Cliente com fatura em atraso pode solicitar desbloqueio temporário (confiança) por até 5 dias.' },

  // ----- FAQ -----
  { category: 'FAQ', title: 'Prazo de instalação', content: 'Após a validação dos dados e do endereço, a instalação é agendada pelo consultor — normalmente em até 3 dias úteis.' },
  { category: 'FAQ', title: 'Formas de pagamento', content: 'Aceitamos PIX, boleto e cartão. A 1ª mensalidade segue a data de adesão.' },
];

async function main() {
  // ----- Company -----
  // Deve coincidir com COMPANY_DEFAULT_NAME (CompanyService.getDefaultCompanyId),
  // senão os operadores ficam num tenant diferente das conversas criadas pelo
  // webhook (BUG-01). Padrão: 'CentralIA'.
  const companyName = process.env.DEFAULT_COMPANY_NAME ?? 'CentralIA';
  let company = await prisma.company.findFirst({ where: { name: companyName } });
  if (!company) {
    company = await prisma.company.create({
      data: { name: companyName, document: '00.000.000/0001-00' },
    });
  }
  console.log(`✓ Company: ${company.name} (${company.id})`);

  // ----- Knowledge base (idempotente e auto-corrige categoria/conteúdo) -----
  for (const a of ARTICLES) {
    const exists = await prisma.knowledgeArticle.findFirst({ where: { title: a.title } });
    if (exists) {
      await prisma.knowledgeArticle.update({
        where: { id: exists.id },
        data: { category: a.category, content: a.content, active: true },
      });
    } else {
      await prisma.knowledgeArticle.create({ data: { ...a, active: true } });
    }
  }
  // Remove artigos de exemplo legados (categorias antigas COMERCIAL/SUPORTE/FINANCEIRO).
  await prisma.knowledgeArticle.deleteMany({
    where: { category: { in: ['COMERCIAL', 'SUPORTE', 'FINANCEIRO'] } },
  });
  console.log(`✓ KnowledgeArticles: ${ARTICLES.length} garantidos`);

  // ----- Usuários internos (todas as roles) -----
  const passwordHash = await bcrypt.hash('CentralIA@123', 10);
  const users: { email: string; name: string; role: UserRole }[] = [
    { email: 'admin@centralia.local', name: 'Administrador', role: UserRole.ADMIN },
    { email: 'manager@centralia.local', name: 'Gerente', role: UserRole.MANAGER },
    { email: 'support@centralia.local', name: 'Suporte', role: UserRole.SUPPORT },
    { email: 'financial@centralia.local', name: 'Financeiro', role: UserRole.FINANCIAL },
    { email: 'commercial@centralia.local', name: 'Comercial', role: UserRole.COMMERCIAL },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: { companyId: company.id, name: u.name, email: u.email, passwordHash, role: u.role },
      update: { passwordHash, role: u.role, companyId: company.id },
    });
  }
  console.log(`✓ Usuários: ${users.map((u) => u.email).join(', ')} (senha CentralIA@123)`);

  // ----- Cliente/serviço demo (usado pelo npm run demo / demo:all) -----
  const demoPhone = '5511955554444';
  const demoCustomer = await prisma.customer.upsert({
    where: { companyId_ispboxId: { companyId: company.id, ispboxId: 'demo-1' } },
    create: {
      companyId: company.id,
      ispboxId: 'demo-1',
      name: 'Cliente Demo',
      cpfCnpj: '123.456.789-00',
      phone: demoPhone,
      email: 'cliente.demo@centralia.local',
    },
    update: { phone: demoPhone },
  });
  const hasService = await prisma.customerService.findFirst({
    where: { customerId: demoCustomer.id, ispboxServiceId: 'svc-demo-1' },
  });
  if (!hasService) {
    await prisma.customerService.create({
      data: {
        customerId: demoCustomer.id,
        ispboxServiceId: 'svc-demo-1',
        type: 'FIBRA',
        status: 'ativo',
      },
    });
  }
  console.log(`✓ Cliente demo: ${demoCustomer.name} (${demoPhone}) + serviço fibra`);

  console.log('\nSeed concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
