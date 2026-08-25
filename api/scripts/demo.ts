/**
 * Demo E2E (sandbox) — exibe o fluxo ponta a ponta no terminal:
 *   Cliente fictício → Mensagem WhatsApp → Supervisor → Financeiro
 *   → Cobrança mock → PIX mock → Resumo → Fila humana.
 *
 * Uso: npm run demo   (requer Postgres + Redis no ar; força APP_MODE=sandbox)
 */
process.env.APP_MODE = 'sandbox';

import { NestFactory } from '@nestjs/core';
import { HumanQueueReason, MessageRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CompanyService } from '../src/common/company/company.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { ConversationsService } from '../src/modules/conversations/conversations.service';
import { AiSupervisorService } from '../src/modules/ai/ai-supervisor.service';
import { FinancialAgent } from '../src/modules/ai/agents/financial.agent';
import { SummaryGeneratorService } from '../src/modules/human-queue/summary-generator.service';
import { HumanQueueService } from '../src/modules/human-queue/human-queue.service';
import { AgentContext } from '../src/modules/ai/ai.types';

function step(n: number, title: string) {
  console.log(`\n\x1b[36m── [${n}] ${title} ──\x1b[0m`);
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const get = <T>(t: any): T => app.get(t, { strict: false });

  const prisma = get<PrismaService>(PrismaService);
  const company = get<CompanyService>(CompanyService);
  const customers = get<CustomersService>(CustomersService);
  const conversations = get<ConversationsService>(ConversationsService);
  const supervisor = get<AiSupervisorService>(AiSupervisorService);
  const financial = get<FinancialAgent>(FinancialAgent);
  const summary = get<SummaryGeneratorService>(SummaryGeneratorService);
  const humanQueue = get<HumanQueueService>(HumanQueueService);

  console.log('\n=============================================');
  console.log(' CentralIA — DEMO E2E (APP_MODE=sandbox)');
  console.log('=============================================');

  // 1) Cliente fictício
  step(1, 'Cliente fictício');
  const companyId = await company.getDefaultCompanyId();
  const phone = '5511988887777';
  const customer = await prisma.customer.upsert({
    where: { companyId_ispboxId: { companyId, ispboxId: 'demo-1' } },
    create: {
      companyId,
      ispboxId: 'demo-1',
      name: 'João da Demo',
      cpfCnpj: '123.456.789-00',
      phone,
      services: { create: { ispboxServiceId: 'svc-1', type: 'FIBRA', status: 'ativo' } },
    },
    update: {},
  });
  console.log(`Cliente: ${customer.name} (${phone})`);

  // 2) Mensagem WhatsApp
  step(2, 'Mensagem WhatsApp recebida');
  const conversation = await conversations.findOrCreateByContact(phone, customer.id);
  const text = 'Olá, quero a segunda via da minha fatura por PIX, por favor.';
  await conversations.addMessage({
    conversationId: conversation.id,
    role: MessageRole.CUSTOMER,
    content: text,
  });
  console.log(`Cliente: "${text}"`);

  const ctxCustomer = await customers.findByPhone(phone);
  const ctx: AgentContext = {
    conversationId: conversation.id,
    contact: phone,
    customer: ctxCustomer,
    history: [{ role: MessageRole.CUSTOMER, content: text }],
    lastUserMessage: text,
  };

  // 3) Supervisor
  step(3, 'Supervisor (classificação de intenção)');
  const classification = await supervisor.classify(ctx);
  console.log(`Intenção: ${classification.intent}  | confiança: ${classification.confidence}`);

  // 4) Agente Financeiro (cobrança mock + PIX mock)
  step(4, 'Agente Financeiro');
  const result = await financial.handle(ctx);
  console.log(`Consultas ISPBOX (mock): ${result.ispboxQueries?.join(', ') || '—'}`);
  console.log(`\nResposta ao cliente:\n${result.reply}`);
  await conversations.addMessage({
    conversationId: conversation.id,
    role: MessageRole.AI,
    content: result.reply,
  });

  // 5) Resumo
  step(5, 'Resumo para handoff');
  const resumo = summary.build({
    customerName: customer.name,
    channel: 'WHATSAPP',
    reason: HumanQueueReason.CLIENT_REQUEST,
    history: [
      { role: MessageRole.CUSTOMER, content: text },
      { role: MessageRole.AI, content: result.reply },
    ],
    ispboxQueries: result.ispboxQueries ?? [],
    suggestedNextAction: 'Confirmar pagamento e encerrar o atendimento.',
  });
  console.log(resumo);

  // 6) Fila humana
  step(6, 'Fila humana');
  const entry = await humanQueue.enqueue({
    conversationId: conversation.id,
    reason: HumanQueueReason.CLIENT_REQUEST,
    summary: resumo,
  });
  console.log(`Item criado na fila humana: ${entry.id} (status=${entry.status})`);

  console.log('\n\x1b[32m✓ Demo concluída — fluxo ponta a ponta executado em sandbox.\x1b[0m\n');
  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
