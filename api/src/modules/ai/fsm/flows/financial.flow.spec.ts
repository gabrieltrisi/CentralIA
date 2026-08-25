import { ConversationStateValue as S } from '@prisma/client';
import { FinancialFlow } from './financial.flow';
import { DataExtractorService } from '../data-extractor.service';
import { IspboxMapperService } from '../../../ispbox/ispbox-mapper.service';
import { ConversationStateContext } from '../conversation-state-context';
import { StateHandler } from '../flow.types';
import { AgentContext } from '../../ai.types';

const customer = {
  id: 'cust-1',
  ispboxId: 'demo-fin',
  name: 'Cliente Demo',
  services: [{ ispboxServiceId: 'svc-1' }],
} as any;

async function drive(
  handlers: Partial<Record<S, StateHandler>>,
  state: ConversationStateContext,
  message: string,
) {
  const agent = {
    conversationId: 'conv-1',
    contact: '5511900000003',
    customer,
    history: [],
    lastUserMessage: message,
  } as AgentContext;
  const shared = { ispboxQueries: [] as string[], intent: 'FINANCIAL' as const, confidence: 1 };
  let guard = 0;
  while (guard++ < 20) {
    const handler = handlers[state.state];
    if (!handler) throw new Error(`sem handler para ${state.state}`);
    const step = await handler(state, agent, shared);
    if (step.goto) state.advanceTo(step.goto);
    if (step.reply !== undefined || step.escalateReason || step.finished) {
      return { reply: step.reply ?? '', outbound: step.outbound, shared };
    }
    if (!step.goto) throw new Error(`sem progresso em ${state.state}`);
  }
  throw new Error('loop');
}

describe('FinancialFlow (FSM completo)', () => {
  it('lista cobranças, gera PIX e PDF e chega ao resumo', async () => {
    const customers = {
      findByPhone: jest.fn().mockResolvedValue(customer),
      findOne: jest.fn().mockResolvedValue(customer),
    } as any;
    const ispbox = {
      listCharges: jest
        .fn()
        .mockResolvedValue([{ id: 'cob-1', valor: 99.9, status: 'vencida', vencimento: '2026-06-01' }]),
    } as any;
    const actions = {
      generatePix: jest.fn().mockResolvedValue({ blocked: false, simulated: true, copiaCola: 'PIX-cob-1' }),
      generatePdf: jest.fn().mockResolvedValue({ blocked: false, simulated: true, url: 'mock://boleto.pdf' }),
    } as any;

    const flow = new FinancialFlow(
      customers, ispbox, new IspboxMapperService(), actions, new DataExtractorService(),
    );
    const handlers = flow.handlers();
    const state = new ConversationStateContext('conv-1', { state: S.FINANCIAL_IDENTIFICATION });

    const t1 = await drive(handlers, state, 'Quero a segunda via do boleto');
    expect(t1.reply).toContain('cob-1');
    expect(t1.reply).toMatch(/PIX/i);
    expect(t1.shared.ispboxQueries).toEqual(
      expect.arrayContaining(['Listagem de cobranças', 'Geração de QR Code PIX', 'Geração do PDF do boleto']),
    );
    // Outbound rico: resumo (texto) + boleto (documento) + PIX (texto).
    const kinds = (t1.outbound ?? []).map((o: any) => o.kind);
    expect(kinds).toEqual(expect.arrayContaining(['text', 'document']));
    expect(state.state).toBe(S.FINANCIAL_SUMMARY);

    const t2 = await drive(handlers, state, 'Obrigado!');
    expect(t2.reply).toMatch(/concluído|obrigado/i);
    expect(state.state).toBe(S.FINISHED);
  });

  it('PIX/PDF bloqueados (sem flag) → orienta atendente humano', async () => {
    const customer2 = { ...customer };
    const customers = {
      findByPhone: jest.fn().mockResolvedValue(customer2),
      findOne: jest.fn().mockResolvedValue(customer2),
    } as any;
    const ispbox = {
      listCharges: jest.fn().mockResolvedValue([{ id: 'cob-9', valor: 50, status: 'vencida', vencimento: '2026-06-01' }]),
    } as any;
    const actions = {
      generatePix: jest.fn().mockResolvedValue({ blocked: true, reason: 'FINANCIAL_ALLOW_PAYMENT_ACTIONS=false' }),
      generatePdf: jest.fn().mockResolvedValue({ blocked: true, reason: 'FINANCIAL_ALLOW_PAYMENT_ACTIONS=false' }),
    } as any;
    const flow = new FinancialFlow(customers, ispbox, new IspboxMapperService(), actions, new DataExtractorService());
    const handlers = flow.handlers();
    const state = new ConversationStateContext('conv-1', { state: S.FINANCIAL_IDENTIFICATION });

    const t1 = await drive(handlers, state, 'segunda via');
    expect(t1.reply).toMatch(/atendente/i);
    expect((t1.outbound ?? []).some((o: any) => o.kind === 'document')).toBe(false);
  });
});
