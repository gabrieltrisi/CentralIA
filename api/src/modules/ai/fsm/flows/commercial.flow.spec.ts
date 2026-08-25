import { ConversationStateValue as S } from '@prisma/client';
import { CommercialFlow } from './commercial.flow';
import { DataExtractorService } from '../data-extractor.service';
import { ValidationService } from '../validation.service';
import { ConversationStateContext } from '../conversation-state-context';
import { StateHandler } from '../flow.types';
import { AgentContext } from '../../ai.types';

/** Driver de teste: replica o loop da FsmService sobre os handlers do fluxo. */
async function drive(
  handlers: Partial<Record<S, StateHandler>>,
  state: ConversationStateContext,
  message: string,
  attachments: any[] = [],
) {
  const agent = {
    conversationId: 'conv-1',
    contact: '5511900000001',
    customer: null,
    history: [],
    lastUserMessage: message,
    attachments,
  } as AgentContext;
  const shared = { ispboxQueries: [] as string[], intent: 'COMMERCIAL' as const, confidence: 1 };

  let guard = 0;
  while (guard++ < 20) {
    const handler = handlers[state.state];
    if (!handler) throw new Error(`sem handler para ${state.state}`);
    const step = await handler(state, agent, shared);
    if (step.goto) state.advanceTo(step.goto);
    if (step.reply !== undefined || step.escalateReason || step.finished) {
      return { reply: step.reply ?? '', escalateReason: step.escalateReason, outbound: step.outbound };
    }
    if (!step.goto) throw new Error(`sem progresso em ${state.state}`);
  }
  throw new Error('loop');
}

describe('CommercialFlow (FSM completo, sem repetir perguntas)', () => {
  const fiberPlans = [
    { name: 'START 200 MEGA', speedMbps: 200, priceBRL: 69.9, description: '', recommended: false },
    { name: 'ULTRA 400 MEGA', speedMbps: 400, priceBRL: 99.9, description: '', recommended: true },
  ];
  const plans = {
    getFiberPlans: jest.fn().mockResolvedValue(fiberPlans),
    getMobilePlans: jest.fn().mockResolvedValue([{ name: 'MÓVEL 20 GIGA', priceBRL: 49.9, description: '', recommended: false }]),
    getRecommendedFiberPlan: jest.fn().mockResolvedValue(fiberPlans[1]),
    formatPlansForCustomer: jest.fn().mockReturnValue('• START 200 MEGA — R$ 69,90\n• ULTRA 400 MEGA — R$ 99,90 ⭐'),
  } as any;
  const attachmentCreate = jest.fn().mockResolvedValue({});
  const prisma = { attachment: { create: attachmentCreate } } as any;
  const coverage = {
    checkByCep: jest.fn().mockResolvedValue({ covered: true, technology: 'FIBER' }),
  };

  function newFlow() {
    return new CommercialFlow(
      new DataExtractorService(),
      new ValidationService(),
      plans,
      prisma,
      coverage as any,
    );
  }

  it('coleta cada campo uma única vez e finaliza com handoff', async () => {
    const flow = newFlow();
    const handlers = flow.handlers();
    const state = new ConversationStateContext('conv-1', {
      state: S.COMMERCIAL_SERVICE_SELECTION,
    });

    const t1 = await drive(handlers, state, 'Quero contratar internet fibra');
    expect(t1.reply).toMatch(/CEP/i);
    expect(state.state).toBe(S.COMMERCIAL_CEP);

    const t2 = await drive(handlers, state, 'Meu CEP é 01001-000');
    expect(coverage.checkByCep).toHaveBeenCalledWith('01001-000', undefined);
    expect(t2.reply).toMatch(/plano|cadastro/i);

    const t3 = await drive(handlers, state, 'Sim, quero contratar');
    expect(t3.reply).toMatch(/nome/i);

    const t4 = await drive(handlers, state, 'Gabriel de Macedo Trisi');
    expect(t4.reply).toMatch(/CPF/i);

    const t5 = await drive(handlers, state, 'Meu CPF é 123.456.789-00');
    expect(t5.reply).toMatch(/RG/i);

    const t6 = await drive(handlers, state, 'RG 12.345.678-9');
    expect(t6.reply).toMatch(/telefone/i);

    const t7 = await drive(handlers, state, 'Meu telefone é 11955554444');
    expect(t7.reply).toMatch(/e-?mail/i);

    const t8 = await drive(handlers, state, 'gabriel@email.com');
    expect(t8.reply).toMatch(/endereço/i);

    const t9 = await drive(handlers, state, 'Rua das Flores, 123, Centro');
    expect(t9.reply).toMatch(/documento|RG ou CNH/i);

    // Upload do RG (identidade) — ainda falta o comprovante.
    const t10 = await drive(handlers, state, 'meu RG', [
      { id: 'att-rg', type: 'image', filename: 'rg.jpg', caption: 'meu RG' },
    ]);
    expect(t10.reply).toMatch(/comprovante/i);

    // Upload do comprovante → completo → handoff.
    const t11 = await drive(handlers, state, 'comprovante', [
      { id: 'att-comp', type: 'document', filename: 'comprovante.pdf', caption: 'comprovante de residência' },
    ]);
    expect(t11.escalateReason).toBe('NEGOTIATION');

    // Todos os campos coletados uma vez:
    expect(state.getCollected('nome')).toBe('Gabriel de Macedo Trisi');
    expect(state.getCollected('cpf')).toBe('123.456.789-00');
    expect(state.getCollected('telefone')).toBe('11955554444');
    expect(state.getCollected('email')).toBe('gabriel@email.com');
    expect(state.hasCollected('endereco')).toBe(true);
    expect(state.getCollected<Record<string, string>>('docs')).toMatchObject({
      rg: 'att-rg',
      comprovante: 'att-comp',
    });
  });

  it('envia botões na pergunta de serviço e na confirmação do plano', async () => {
    const flow = newFlow();
    const handlers = flow.handlers();
    const state = new ConversationStateContext('conv-1', { state: S.COMMERCIAL_SERVICE_SELECTION });

    // Mensagem sem serviço → botões Fibra/Móvel.
    const t1: any = await drive(handlers, state, 'quero contratar');
    expect(t1.outbound?.[0]?.kind).toBe('buttons');
    expect(t1.outbound[0].buttons.map((b: any) => b.id)).toEqual(['fibra', 'movel']);

    // Avança até a apresentação do plano → botões Sim/Atendente.
    await drive(handlers, state, 'fibra');
    const t3: any = await drive(handlers, state, '01001-000');
    expect(t3.outbound?.[0]?.kind).toBe('buttons');
    expect(t3.outbound[0].buttons.map((b: any) => b.id)).toEqual(['sim', 'humano']);
  });

  it('reprova CPF inválido e pergunta novamente o mesmo campo', async () => {
    const flow = newFlow();
    const handlers = flow.handlers();
    const state = new ConversationStateContext('conv-1', {
      state: S.COMMERCIAL_DATA_COLLECTION,
    });
    state.setCollected('nome', 'Gabriel Trisi');
    state.setCollected('awaitingField', 'cpf');

    const bad = await drive(handlers, state, 'meu cpf é 123');
    expect(bad.reply).toMatch(/CPF inválido/i);
    expect(state.hasCollected('cpf')).toBe(false);
  });
});
