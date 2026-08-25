import { PrismaClient } from '@prisma/client';

/**
 * Popula dados de DEMONSTRAÇÃO (sandbox) de forma DETERMINÍSTICA e IDEMPOTENTE.
 * - Nenhum efeito externo real (Prisma puro): não chama Meta/ISPBOX, não gera PIX/OS reais.
 * - Idempotente: remove os registros demo anteriores (por contatos fixos) e recria.
 * Reutilizado pelo script `npm run demo:prod` e pelo endpoint interno guardado.
 */

// Contatos fixos da demo (distintos do telefone do piloto). Servem de marcador idempotente.
const DEMO_CONTACTS = ['5571900010001', '5571900010002', '5571900010003', '5571900010004'];

const min = (m: number) => new Date(Date.now() + m * 60_000);

type Prisma = PrismaClient;

export interface DemoResult {
  companyId: string;
  conversations: { comercial: string; suporte: string; financeiro: string; novo: string };
  tickets: { aberto: string; resolvido: string; tecnico: string };
  counts: { conversations: number; humanQueue: number; tickets: number; attachments: number };
}

export async function seedDemo(prisma: Prisma): Promise<DemoResult> {
  if ((process.env.APP_MODE ?? '').toLowerCase() !== 'sandbox') {
    throw new Error('demo:prod só roda com APP_MODE=sandbox (segurança).');
  }

  const companyName = process.env.DEFAULT_COMPANY_NAME ?? 'CentralIA';
  const company =
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } })) ??
    (await prisma.company.create({ data: { name: companyName } }));
  const companyId = company.id;
  const admin =
    (await prisma.user.findFirst({ where: { companyId, role: 'ADMIN' } })) ??
    (await prisma.user.findFirst({ where: { companyId } }));

  // ---- Limpeza idempotente dos registros demo anteriores ----
  const prior = await prisma.conversation.findMany({ where: { contact: { in: DEMO_CONTACTS } }, select: { id: true } });
  const priorIds = prior.map((c) => c.id);
  if (priorIds.length) {
    await prisma.ticket.deleteMany({ where: { conversationId: { in: priorIds } } }); // cascata: events/workOrders
    await prisma.conversation.deleteMany({ where: { id: { in: priorIds } } }); // cascata: messages/attachments/fsm/queue
  }

  // ---- Clientes (upsert) ----
  const cliCom = await upsertCustomer(prisma, companyId, 'demo-com', { name: 'Gabriel Trisi Demo', cpfCnpj: '123.456.789-00', phone: DEMO_CONTACTS[0], email: 'gabriel.demo@centralia.local' });
  const cliSup = await upsertCustomer(prisma, companyId, 'demo-sup', { name: 'Cliente Suporte Demo', cpfCnpj: '987.654.321-00', phone: DEMO_CONTACTS[1], email: 'suporte.demo@centralia.local' });
  const cliFin = await upsertCustomer(prisma, companyId, 'demo-fin', { name: 'Cliente Financeiro Demo', cpfCnpj: '111.222.333-44', phone: DEMO_CONTACTS[2], email: 'financeiro.demo@centralia.local' });

  // ---- COMERCIAL: contratação de fibra, documento parcial, handoff ----
  const com = await prisma.conversation.create({ data: { companyId, customerId: cliCom.id, contact: DEMO_CONTACTS[0], intent: 'COMMERCIAL', status: 'HUMAN', lastMessageAt: new Date() } });
  await messages(prisma, com.id, [
    ['CUSTOMER', 'Quero contratar internet fibra'],
    ['AI', 'Ótimo! Para verificar a cobertura, me informe o seu CEP (00000-000).'],
    ['CUSTOMER', 'Meu CEP é 01001-000'],
    ['AI', 'Boa notícia: há cobertura de fibra no seu endereço! Recomendo o plano ULTRA 400 MEGA por R$ 99,90/mês.'],
    ['CUSTOMER', 'Quero esse plano'],
    ['AI', 'Perfeito! Para finalizar, preciso de RG ou CNH, CPF e comprovante de residência.'],
    ['CUSTOMER', 'Segue meu RG'],
  ]);
  await prisma.conversationState.create({ data: { conversationId: com.id, state: 'COMMERCIAL_DOCUMENT_UPLOAD', collectedData: { servico: 'fibra', cep: '01001-000', plano: 'ULTRA 400 MEGA', planoApresentado: true, nome: 'Gabriel Trisi Demo', cpf: '123.456.789-00', rg: '12.345.678-9', telefone: DEMO_CONTACTS[0], email: 'gabriel.demo@centralia.local', endereco: 'Rua das Flores, 123, Centro', documentos: ['rg'] } } });
  await attachment(prisma, com.id, { type: 'image', mimeType: 'image/jpeg', filename: 'rg.jpg', sizeBytes: 122880 });
  await prisma.humanQueue.create({ data: { conversationId: com.id, reason: 'NEGOTIATION', summary: 'Cliente quer o plano ULTRA 400 MEGA; falta o comprovante de residência para finalizar.', status: 'WAITING', priority: 'HIGH', dueAt: min(25) } });

  // ---- SUPORTE: sem conexão, vídeo, ticket + OS, alta prioridade ----
  const sup = await prisma.conversation.create({ data: { companyId, customerId: cliSup.id, contact: DEMO_CONTACTS[1], intent: 'SUPPORT', status: 'HUMAN', lastMessageAt: new Date() } });
  await messages(prisma, sup.id, [
    ['CUSTOMER', 'Estou sem internet'],
    ['AI', 'Sinto muito pelo transtorno! Pode me enviar um vídeo curto mostrando os LEDs do roteador/ONU?'],
    ['CUSTOMER', 'Segue o vídeo dos LEDs'],
    ['AI', 'Recebido. Abri um chamado e vou validar o status na ISPBOX; se persistir offline, encaminho para o técnico.'],
  ]);
  await attachment(prisma, sup.id, { type: 'video', mimeType: 'video/mp4', filename: 'leds.mp4', sizeBytes: 1_887_436 });
  const tkAberto = await prisma.ticket.create({ data: { companyId, customerId: cliSup.id, conversationId: sup.id, type: 'SUPPORT', status: 'OPEN', summary: 'Sem conexão — cliente offline' } });
  await prisma.ticketEvent.createMany({ data: [{ ticketId: tkAberto.id, event: 'created' }, { ticketId: tkAberto.id, event: 'media_attached' }, { ticketId: tkAberto.id, event: 'work_order_opened' }] });
  await prisma.workOrder.create({ data: { ticketId: tkAberto.id, ispboxOsId: 'os-sandbox-001' } });
  await prisma.humanQueue.create({ data: { conversationId: sup.id, reason: 'COMPLEX_SUPPORT', summary: 'Cliente sem internet; vídeo dos LEDs enviado. OS aberta na ISPBOX (sandbox).', status: 'WAITING', priority: 'URGENT', dueAt: min(-12) } });
  if (admin) await prisma.humanQueue.create({ data: { conversationId: sup.id, reason: 'COMPLEX_SUPPORT', summary: 'Em atendimento pelo agente — diagnóstico em andamento.', status: 'ASSIGNED', priority: 'HIGH', assignedUserId: admin.id, dueAt: min(15) } });
  const tkTecnico = await prisma.ticket.create({ data: { companyId, customerId: cliSup.id, conversationId: sup.id, type: 'SUPPORT', status: 'IN_PROGRESS', summary: 'Aguardando visita técnica' } });
  await prisma.workOrder.create({ data: { ticketId: tkTecnico.id, ispboxOsId: 'os-sandbox-002' } });
  await prisma.ticketEvent.create({ data: { ticketId: tkTecnico.id, event: 'work_order_scheduled' } });

  // ---- FINANCEIRO: cobrança vencida, PIX/PDF mock, resolvido ----
  const fin = await prisma.conversation.create({ data: { companyId, customerId: cliFin.id, contact: DEMO_CONTACTS[2], intent: 'FINANCIAL', status: 'CLOSED', lastMessageAt: new Date() } });
  await messages(prisma, fin.id, [
    ['CUSTOMER', 'Quero a segunda via'],
    ['AI', 'Identifiquei uma cobrança vencida em aberto. Posso te enviar a segunda via do boleto ou o PIX para pagamento agora.'],
    ['CUSTOMER', 'Manda o PIX'],
    ['AI', 'Enviei o PIX para pagamento. Após a confirmação, o sistema seguirá com a baixa conforme o processamento financeiro.'],
  ]);
  await attachment(prisma, fin.id, { type: 'document', mimeType: 'application/pdf', filename: 'comprovante.pdf', sizeBytes: 81_920 });
  await prisma.humanQueue.create({ data: { conversationId: fin.id, reason: 'CLIENT_REQUEST', summary: 'Segunda via solicitada; PIX gerado (sandbox). Aguardando confirmação/baixa.', status: 'WAITING', priority: 'NORMAL', dueAt: min(3) } });
  await prisma.humanQueue.create({ data: { conversationId: fin.id, reason: 'CLIENT_REQUEST', summary: 'Atendimento financeiro finalizado — cliente satisfeito.', status: 'RESOLVED', priority: 'NORMAL', dueAt: min(-40), resolvedAt: min(-5) } });
  const tkResolvido = await prisma.ticket.create({ data: { companyId, customerId: cliFin.id, conversationId: fin.id, type: 'FINANCIAL', status: 'RESOLVED', summary: 'Segunda via / PIX gerado' } });
  await prisma.ticketEvent.create({ data: { ticketId: tkResolvido.id, event: 'resolved' } });

  // ---- NOVO: lead comercial sem atendente (coluna "Novos") ----
  const novo = await prisma.conversation.create({ data: { companyId, customerId: cliCom.id, contact: DEMO_CONTACTS[3], intent: 'COMMERCIAL', status: 'HUMAN', lastMessageAt: new Date() } });
  await messages(prisma, novo.id, [['CUSTOMER', 'Olá, quero saber dos planos de internet']]);
  await prisma.humanQueue.create({ data: { conversationId: novo.id, reason: 'NEGOTIATION', summary: 'Novo lead comercial para primeiro contato.', status: 'WAITING', priority: 'NORMAL', dueAt: min(40) } });

  const counts = {
    conversations: await prisma.conversation.count({ where: { contact: { in: DEMO_CONTACTS } } }),
    humanQueue: await prisma.humanQueue.count({ where: { conversation: { contact: { in: DEMO_CONTACTS } } } }),
    tickets: await prisma.ticket.count({ where: { conversation: { contact: { in: DEMO_CONTACTS } } } }),
    attachments: await prisma.attachment.count({ where: { conversation: { contact: { in: DEMO_CONTACTS } } } }),
  };

  return {
    companyId,
    conversations: { comercial: com.id, suporte: sup.id, financeiro: fin.id, novo: novo.id },
    tickets: { aberto: tkAberto.id, resolvido: tkResolvido.id, tecnico: tkTecnico.id },
    counts,
  };
}

async function upsertCustomer(prisma: Prisma, companyId: string, ispboxId: string, data: { name: string; cpfCnpj: string; phone: string; email: string }) {
  const customer = await prisma.customer.upsert({
    where: { companyId_ispboxId: { companyId, ispboxId } },
    create: { companyId, ispboxId, ...data },
    update: { ...data },
  });
  const svc = await prisma.customerService.findFirst({ where: { customerId: customer.id, ispboxServiceId: `svc-${ispboxId}` } });
  if (!svc) await prisma.customerService.create({ data: { customerId: customer.id, ispboxServiceId: `svc-${ispboxId}`, type: 'FIBRA', status: 'ativo' } });
  return customer;
}

async function messages(prisma: Prisma, conversationId: string, items: ['CUSTOMER' | 'AI' | 'AGENT' | 'SYSTEM', string][]) {
  let i = 0;
  for (const [role, content] of items) {
    await prisma.message.create({ data: { conversationId, role, content, createdAt: min(-60 + i * 2) } });
    i++;
  }
}

async function attachment(prisma: Prisma, conversationId: string, a: { type: string; mimeType: string; filename: string; sizeBytes: number }) {
  await prisma.attachment.create({
    data: {
      conversationId,
      url: `/storage/demo/${a.filename}`, // mock — sem storage externo real
      type: a.type,
      mimeType: a.mimeType,
      filename: a.filename,
      storedName: `demo-${a.filename}`,
      sizeBytes: a.sizeBytes,
      provider: 'mock',
    },
  });
}
