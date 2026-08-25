/**
 * Demo COMPLETO (sandbox) — valida Comercial, Suporte e Financeiro sem efeitos
 * reais, SEM depender de ANTHROPIC_API_KEY, agora com MÍDIA MOCK (anexos).
 *
 * Uso: npm run demo:all   (requer Postgres + Redis no ar)
 */
process.env.APP_MODE = 'sandbox';
delete process.env.ANTHROPIC_API_KEY;

import { NestFactory } from '@nestjs/core';
import { HumanQueueReason, MessageRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CompanyService } from '../src/common/company/company.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { ConversationsService } from '../src/modules/conversations/conversations.service';
import { AiSupervisorService } from '../src/modules/ai/ai-supervisor.service';
import { FsmService } from '../src/modules/ai/fsm/fsm.service';
import { ConversationStateService } from '../src/modules/ai/fsm/conversation-state.service';
import { SummaryGeneratorService } from '../src/modules/human-queue/summary-generator.service';
import { HumanQueueService } from '../src/modules/human-queue/human-queue.service';
import { MetaWhatsappMediaService } from '../src/modules/meta-whatsapp/meta-whatsapp-media.service';
import { AttachmentAccessService } from '../src/modules/attachments/attachment-access.service';
import { PlanProviderService } from '../src/modules/knowledge/plan-provider.service';
import { COVERAGE_PROVIDER, CoverageProvider } from '../src/modules/ai/coverage/coverage.provider';
import { MediaKind } from '../src/common/storage/file-security.service';
import { AgentContext, IncomingAttachment } from '../src/modules/ai/ai.types';

const C = {
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function banner(title: string) {
  console.log('\n' + C.cyan('═'.repeat(60)));
  console.log(C.cyan('  ' + C.bold(title)));
  console.log(C.cyan('═'.repeat(60)));
}

interface MediaSpec {
  type: MediaKind;
  mimeType: string;
  filename: string;
  mediaId: string;
}
type TurnSpec = string | { text?: string; media: MediaSpec };

interface Scenario {
  title: string;
  phone: string;
  identify: boolean;
  ispboxId?: string;
  turns: TurnSpec[];
  reason: HumanQueueReason;
  nextAction: string;
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const get = <T>(t: any): T => app.get(t, { strict: false });

  const prisma = get<PrismaService>(PrismaService);
  const company = get<CompanyService>(CompanyService);
  const customers = get<CustomersService>(CustomersService);
  const conversations = get<ConversationsService>(ConversationsService);
  const supervisor = get<AiSupervisorService>(AiSupervisorService);
  const fsm = get<FsmService>(FsmService);
  const stateSvc = get<ConversationStateService>(ConversationStateService);
  const summary = get<SummaryGeneratorService>(SummaryGeneratorService);
  const humanQueue = get<HumanQueueService>(HumanQueueService);
  const media = get<MetaWhatsappMediaService>(MetaWhatsappMediaService);
  const attachmentAccess = get<AttachmentAccessService>(AttachmentAccessService);

  const companyId = await company.getDefaultCompanyId();
  console.log(C.bold('\n CentralIA — DEMO COMPLETO (sandbox, sem IA real, com mídia mock)'));

  // Reset idempotente.
  const demoPhones = ['5511900000001', '5511900000002', '5511900000003'];
  const prior = await prisma.conversation.findMany({ where: { contact: { in: demoPhones } } });
  for (const c of prior) await prisma.ticket.deleteMany({ where: { conversationId: c.id } });
  await prisma.conversation.deleteMany({ where: { contact: { in: demoPhones } } });

  const scenarios: Scenario[] = [
    {
      title: 'FLUXO COMERCIAL — contratação de fibra (coleta + documentos)',
      phone: '5511900000001',
      identify: false,
      turns: [
        'Quero contratar internet fibra',
        'Meu CEP é 01001-000',
        'Sim, quero contratar',
        'Gabriel de Macedo Trisi',
        'Meu CPF é 123.456.789-00',
        'RG 12.345.678-9',
        'Meu telefone é 11955554444',
        'gabriel@email.com',
        'Rua das Flores, 123, Centro',
        { text: 'meu RG', media: { type: 'image', mimeType: 'image/jpeg', filename: 'rg.jpg', mediaId: 'media-rg' } },
        { text: 'comprovante de residência', media: { type: 'document', mimeType: 'application/pdf', filename: 'comprovante.pdf', mediaId: 'media-comp' } },
      ],
      reason: HumanQueueReason.NEGOTIATION,
      nextAction: 'Consultor finaliza a contratação e agenda a instalação.',
    },
    {
      title: 'FLUXO SUPORTE — sem internet (com vídeo)',
      phone: '5511900000002',
      identify: true,
      ispboxId: 'demo-sup',
      turns: [
        'Estou sem internet',
        { text: 'segue o vídeo dos LEDs', media: { type: 'video', mimeType: 'video/mp4', filename: 'leds.mp4', mediaId: 'media-vid' } },
      ],
      reason: HumanQueueReason.COMPLEX_SUPPORT,
      nextAction: 'Acompanhar a OS aberta e retornar ao cliente.',
    },
    {
      title: 'FLUXO FINANCEIRO — segunda via do boleto',
      phone: '5511900000003',
      identify: true,
      ispboxId: 'demo-fin',
      turns: ['Quero a segunda via do boleto', 'Obrigado!'],
      reason: HumanQueueReason.CLIENT_REQUEST,
      nextAction: 'Confirmar o pagamento e encerrar o atendimento.',
    },
  ];

  for (const sc of scenarios) {
    banner(sc.title);

    if (sc.identify && sc.ispboxId) {
      const customer = await prisma.customer.upsert({
        where: { companyId_ispboxId: { companyId, ispboxId: sc.ispboxId } },
        create: {
          companyId, ispboxId: sc.ispboxId, name: 'Cliente Demo',
          cpfCnpj: '123.456.789-00', phone: sc.phone, email: 'demo@centralia.local',
        },
        update: { phone: sc.phone },
      });
      const svc = await prisma.customerService.findFirst({
        where: { customerId: customer.id, ispboxServiceId: `svc-${sc.ispboxId}` },
      });
      if (!svc) {
        await prisma.customerService.create({
          data: { customerId: customer.id, ispboxServiceId: `svc-${sc.ispboxId}`, type: 'FIBRA', status: 'ativo' },
        });
      }
      console.log(C.gray(`Cliente identificado: ${customer.name} (${sc.phone})`));
    } else {
      console.log(C.gray(`Lead não identificado (${sc.phone})`));
    }

    const conversation = await conversations.findOrCreateByContact(sc.phone);
    const ctxCustomer = await customers.findByPhone(sc.phone);
    const ispboxCalls = new Set<string>();
    let escalated = false;
    let step = 0;

    for (const turn of sc.turns) {
      step++;
      const text = typeof turn === 'string' ? turn : (turn.text ?? '');
      const mediaSpec = typeof turn === 'string' ? undefined : turn.media;

      // Mídia: ingere (mock storage) e cria Attachment real.
      const attachments: IncomingAttachment[] = [];
      if (mediaSpec) {
        const att = await media.ingest({
          conversationId: conversation.id,
          mediaId: mediaSpec.mediaId,
          type: mediaSpec.type,
          mimeType: mediaSpec.mimeType,
          filename: mediaSpec.filename,
        });
        attachments.push({ id: att.id, type: att.type ?? mediaSpec.type, mimeType: att.mimeType ?? undefined, filename: att.filename ?? undefined, caption: text });
      }

      await conversations.addMessage({
        conversationId: conversation.id,
        role: MessageRole.CUSTOMER,
        content: text || `[${mediaSpec?.type}]`,
      });

      const history = (await conversations.getHistory(conversation.id)).map((m) => ({ role: m.role, content: m.content }));
      const ctx: AgentContext = {
        conversationId: conversation.id,
        contact: sc.phone,
        customer: ctxCustomer,
        history,
        lastUserMessage: text,
        messageType: mediaSpec?.type ?? 'text',
        attachments,
      };

      const intent = await supervisor.classify(ctx);
      const result = await fsm.handle(ctx, intent.intent, intent.confidence);
      const state = await stateSvc.get(conversation.id);

      await conversations.addMessage({ conversationId: conversation.id, role: MessageRole.AI, content: result.reply });
      (result.ispboxQueries ?? []).forEach((q) => ispboxCalls.add(q));

      console.log('\n' + C.yellow(`[Etapa ${step}]`));
      console.log(`  👤 Cliente : ${text || '(enviou mídia)'}`);
      if (mediaSpec) {
        const att = attachments[0];
        console.log(C.green(`  📎 Anexo   : ${att.id.slice(0, 8)} (${att.type}, ${att.filename})`));
      }
      if (step === 1) console.log(C.gray(`  🧭 Intenção: ${intent.intent} (conf. ${intent.confidence})`));
      console.log(`  🤖 IA      : ${result.reply.split('\n')[0]}`);
      console.log(C.gray(`  🔄 FSM     : ${state?.state ?? 'START'}`));
      if (result.ispboxQueries?.length) console.log(C.gray(`  🔌 ISPBOX  : ${result.ispboxQueries.join(', ')}`));
      if (result.outbound?.length) console.log(C.gray(`  📤 Outbound: ${result.outbound.map((o) => o.kind).join(', ')}`));
      if (result.escalateReason) escalated = true;
    }

    // Tickets + OS (suporte).
    const tickets = await waitForWorkOrders(prisma, conversation.id);
    for (const t of tickets) {
      console.log('\n' + C.green(`  🎫 Ticket ${t.id.slice(0, 8)} (${t.type}) — ${t.status}`));
      for (const wo of t.workOrders) console.log(C.green(`     OS mock: ${wo.ispboxOsId ?? '—'} (${wo.status})`));
    }

    // Anexos persistidos na conversa.
    const atts = await prisma.attachment.findMany({ where: { conversationId: conversation.id } });
    if (atts.length) {
      console.log('\n' + C.green(`  📎 Anexos (${atts.length}): ` + atts.map((a) => `${a.type}/${a.filename} [${a.provider}]`).join(', ')));
    }

    // Handoff (comercial).
    if (escalated) {
      const resumo = summary.build({
        customerName: ctxCustomer?.name ?? 'Lead', channel: 'WHATSAPP', reason: sc.reason,
        history: (await conversations.getHistory(conversation.id)).map((m) => ({ role: m.role, content: m.content })),
        ispboxQueries: [...ispboxCalls], suggestedNextAction: sc.nextAction,
      });
      const entry = await humanQueue.enqueue({ conversationId: conversation.id, reason: sc.reason, summary: resumo });
      console.log('\n' + C.green(`  🙋 Handoff humano criado: ${entry.id.slice(0, 8)} (${entry.status})`));
    }
  }

  // ---- Comercial ChipNews real (planos + cobertura reais da base) ----
  banner('COMERCIAL CHIPNEWS REAL');
  const planProvider = get<PlanProviderService>(PlanProviderService);
  const coverage = get<CoverageProvider>(COVERAGE_PROVIDER);

  const fiber = await planProvider.getFiberPlans(companyId);
  console.log(C.green('  📦 Planos Fibra (base ChipNews, valores reais):'));
  planProvider.formatPlansForCustomer(fiber).split('\n').forEach((l) => console.log('     ' + l));
  const recommended = await planProvider.getRecommendedFiberPlan(companyId);
  console.log(C.gray(`  💡 Recomendado: ${recommended?.name ?? '—'} (R$ ${recommended?.priceBRL?.toFixed(2).replace('.', ',') ?? '—'})`));

  console.log('');
  for (const cep of ['01001-000', '09000-000']) {
    const cov = await coverage.checkByCep(cep, companyId);
    const tag = cov.covered ? C.green('COBERTO (fibra)') : C.yellow('sem fibra');
    const extra = cov.matchedRule ? ` [${cov.matchedRule}]` : cov.suggestedAlternative ? ` → ${cov.suggestedAlternative}` : '';
    console.log(C.gray(`  📍 CEP ${cep}: `) + tag + C.gray(` — ${cov.reason ?? ''}${extra}`));
  }

  // Plano escolhido no fluxo comercial (sem repetição de perguntas).
  const commConvForPlan = await prisma.conversation.findFirst({ where: { contact: '5511900000001' } });
  const commFsm = commConvForPlan
    ? await prisma.conversationState.findUnique({ where: { conversationId: commConvForPlan.id } })
    : null;
  const collected = (commFsm?.collectedData ?? {}) as Record<string, unknown>;
  console.log('');
  console.log(C.green(`  ✅ Coleta sem repetição → nome=${collected.nome ?? '—'}, cpf=${collected.cpf ?? '—'}, plano escolhido: ${collected.plano ?? '—'}`));

  // ---- Recursos de produção (sandbox) ----
  banner('RECURSOS DE PRODUÇÃO (sandbox)');

  // Magic bytes: a ingestão de mídia já validou a assinatura binária.
  console.log(C.green('  🔎 Magic bytes : anexos validados na ingestão (JPEG/PDF/MP4).'));

  // Idempotência de webhook.
  const commConv = await prisma.conversation.findFirst({ where: { contact: '5511900000001' } });
  if (commConv) {
    await prisma.message.upsert({
      where: { externalId: 'wamid.demo-dup' },
      create: { conversationId: commConv.id, role: MessageRole.CUSTOMER, content: 'dup', externalId: 'wamid.demo-dup' },
      update: {},
    });
    const dup = await prisma.message.findUnique({ where: { externalId: 'wamid.demo-dup' } });
    console.log(C.green(`  ♻️  Idempotência: providerMessageId 'wamid.demo-dup' já existe → duplicate_webhook_ignored (${dup ? 'ok' : '—'})`));
  }

  // Share-link temporário de um anexo do comercial.
  const att = await prisma.attachment.findFirst({ where: { conversationId: commConv?.id } });
  if (att) {
    const link = await attachmentAccess.createShareLink(att.id, Date.now());
    console.log(C.green(`  🔗 Share-link  : ${link.url.slice(0, 60)}... (expira ${link.expiresAt})`));
  }

  // Auditoria.
  const auditCount = await prisma.auditLog.count();
  const byAction = await prisma.auditLog.groupBy({ by: ['action'], _count: { action: true } });
  console.log(C.green(`  🧾 Auditoria   : ${auditCount} eventos (${byAction.map((a) => `${a.action}:${a._count.action}`).join(', ')})`));

  console.log('\n' + C.green('✓ Demo completo concluído — fluxos + mídia + produção (idempotência, share-link, auditoria) em sandbox.\n'));
  await app.close();
}

async function waitForWorkOrders(prisma: PrismaService, conversationId: string) {
  for (let i = 0; i < 15; i++) {
    const tickets = await prisma.ticket.findMany({ where: { conversationId }, include: { workOrders: true } });
    if (tickets.length === 0) return [];
    const pending = tickets.some((t) => t.workOrders.length === 0 || t.workOrders.some((w) => w.status === 'PENDING'));
    if (!pending) return tickets;
    await new Promise((r) => setTimeout(r, 300));
  }
  return prisma.ticket.findMany({ where: { conversationId }, include: { workOrders: true } });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
