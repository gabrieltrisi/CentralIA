import { ForbiddenException } from '@nestjs/common';
import { ConversationSummaryService } from './conversation-summary.service';

function make(detail: any, hq: any = null) {
  const conversations = { getDetail: jest.fn().mockResolvedValue(detail), findOne: jest.fn() } as any;
  const prisma = { humanQueue: { findFirst: jest.fn().mockResolvedValue(hq) } } as any;
  return { svc: new ConversationSummaryService(conversations, prisma), conversations };
}

const base = {
  id: 'c1', contact: '5511999999999', status: 'HUMAN',
  updatedAt: new Date('2026-06-16T12:00:00Z'), lastMessageAt: new Date('2026-06-16T12:00:00Z'),
  messages: [], attachments: [], tickets: [], customer: null, fsm: null,
};

describe('ConversationSummaryService (determinístico, sem IA)', () => {
  it('Comercial com documento pendente', async () => {
    const { svc } = make({
      ...base, intent: 'COMMERCIAL', customer: { name: 'João Silva' },
      fsm: { state: 'COMMERCIAL_DOCUMENT_UPLOAD', collectedData: { nome: 'João', cpf: '123.456.789-00', telefone: '11999998888', servico: 'fibra', cep: '01001-000', plano: 'ULTRA 400 MEGA', documentos: ['rg'] } },
    }, { reason: 'NEGOTIATION', priority: 'HIGH', status: 'WAITING', dueAt: new Date(Date.now() + 9e5) });
    const s = await svc.build('c1', 'comp-1');

    expect(s.intent).toBe('COMMERCIAL');
    expect(s.customerName).toBe('João Silva');
    expect(s.collectedData).toEqual(expect.arrayContaining(['Nome', 'CPF', 'Telefone']));
    expect(s.pendingItems).toEqual(expect.arrayContaining(['comprovante de residência']));
    expect(s.highlights).toEqual(expect.arrayContaining(['Plano: ULTRA 400 MEGA', 'CEP: 01001-000']));
    expect(s.recommendedNextStep.toLowerCase()).toMatch(/document|instala/);
    expect(s.handoffReason).toBe('Negociação');
    expect(s.aiEnhanced).toBe(false); // funciona sem ANTHROPIC_API_KEY
  });

  it('Suporte com ticket aberto + evidência', async () => {
    const { svc } = make({
      ...base, intent: 'SUPPORT', customer: { name: 'Maria' },
      messages: [{ role: 'CUSTOMER', content: 'Estou sem internet' }],
      attachments: [{ type: 'video' }], tickets: [{ status: 'OPEN', workOrders: [] }],
    }, { reason: 'COMPLEX_SUPPORT', priority: 'URGENT', status: 'WAITING', dueAt: new Date(Date.now() - 6e5) });
    const s = await svc.build('c1', 'comp-1');

    expect(s.intent).toBe('SUPPORT');
    expect(s.highlights).toEqual(expect.arrayContaining(['Ticket: aberto']));
    expect(s.highlights.some((h) => /Evid/.test(h))).toBe(true);
    expect(s.recommendedNextStep.toLowerCase()).toMatch(/ispbox|técnic/);
    expect(s.currentSituation.toLowerCase()).toMatch(/conex|suporte/);
    expect(s.urgency).toBe('urgent'); // SLA overdue / URGENT
  });

  it('Financeiro com PIX gerado', async () => {
    const { svc } = make({
      ...base, intent: 'FINANCIAL', customer: { name: 'Carlos' },
      messages: [{ role: 'AI', content: 'Enviei o PIX para pagamento. Após a confirmação...' }],
    }, { reason: 'CLIENT_REQUEST', priority: 'NORMAL', status: 'WAITING', dueAt: new Date(Date.now() + 9e5) });
    const s = await svc.build('c1', 'comp-1');

    expect(s.intent).toBe('FINANCIAL');
    expect(s.highlights).toEqual(expect.arrayContaining(['PIX: gerado']));
    expect(s.recommendedNextStep.toLowerCase()).toMatch(/baixa|comprovante/);
  });

  it('RBAC/companyId: delega a checagem ao getDetail', async () => {
    const conversations = { getDetail: jest.fn().mockRejectedValue(new ForbiddenException()) } as any;
    const prisma = { humanQueue: { findFirst: jest.fn() } } as any;
    const svc = new ConversationSummaryService(conversations, prisma);
    await expect(svc.build('c1', 'outra-empresa')).rejects.toThrow(ForbiddenException);
    expect(conversations.getDetail).toHaveBeenCalledWith('c1', 'outra-empresa');
  });
});
