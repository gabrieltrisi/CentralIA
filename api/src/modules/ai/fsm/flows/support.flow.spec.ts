import { ConversationStateValue as S } from '@prisma/client';
import { SupportFlow } from './support.flow';
import { DataExtractorService } from '../data-extractor.service';
import { IspboxMapperService } from '../../../ispbox/ispbox-mapper.service';
import { ConversationStateContext } from '../conversation-state-context';
import { StateHandler } from '../flow.types';
import { AgentContext } from '../../ai.types';

const customer = {
  id: 'cust-1',
  ispboxId: 'demo-sup',
  name: 'Cliente Demo',
  services: [{ ispboxServiceId: 'svc-1' }],
} as any;

async function drive(
  handlers: Partial<Record<S, StateHandler>>,
  state: ConversationStateContext,
  message: string,
  attachments: any[] = [],
) {
  const agent = {
    conversationId: 'conv-1',
    contact: '5511900000002',
    customer,
    history: [],
    lastUserMessage: message,
    attachments,
  } as AgentContext;
  const shared = { ispboxQueries: [] as string[], intent: 'SUPPORT' as const, confidence: 1 };
  let guard = 0;
  while (guard++ < 20) {
    const handler = handlers[state.state];
    if (!handler) throw new Error(`sem handler para ${state.state}`);
    const step = await handler(state, agent, shared);
    if (step.goto) state.advanceTo(step.goto);
    if (step.reply !== undefined || step.escalateReason || step.finished) {
      return { reply: step.reply ?? '', escalateReason: step.escalateReason, shared };
    }
    if (!step.goto) throw new Error(`sem progresso em ${state.state}`);
  }
  throw new Error('loop');
}

describe('SupportFlow (FSM completo)', () => {
  it('offline: pede vídeo, recebe, abre ticket+OS e conclui', async () => {
    const customers = {
      findByPhone: jest.fn().mockResolvedValue(customer),
      findOne: jest.fn().mockResolvedValue(customer),
    } as any;
    const ispbox = {
      internetStatus: jest.fn().mockResolvedValue({ online: false, status: 'offline' }),
    } as any;
    const ticketsCreate = jest.fn().mockResolvedValue({ id: 'ticket-1' });
    const addEvent = jest.fn().mockResolvedValue({});
    const tickets = { create: ticketsCreate, addEvent } as any;
    const knowledge = { findSupportProcedure: jest.fn().mockResolvedValue(null) } as any;
    const attachmentCreate = jest.fn().mockResolvedValue({});
    const prisma = { attachment: { create: attachmentCreate } } as any;
    const config = { get: jest.fn().mockReturnValue('1') } as any;
    const queueAdd = jest.fn().mockResolvedValue(undefined);
    const ticketQueue = { add: queueAdd } as any;
    const access = { osDecision: jest.fn().mockReturnValue({ allowed: true, simulated: true, reason: 'sandbox' }) } as any;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;

    const flow = new SupportFlow(
      customers, ispbox, new IspboxMapperService(), access, tickets, knowledge,
      new DataExtractorService(), prisma, config, audit, ticketQueue,
    );
    const handlers = flow.handlers();
    const state = new ConversationStateContext('conv-1', { state: S.SUPPORT_IDENTIFICATION });

    const t1 = await drive(handlers, state, 'Estou sem internet');
    expect(t1.reply).toMatch(/vídeo/i);
    expect(state.state).toBe(S.SUPPORT_VIDEO_REQUEST);

    const t2 = await drive(handlers, state, 'segue o vídeo', [
      { id: 'att-vid', type: 'video', filename: 'leds.mp4' },
    ]);
    expect(ticketsCreate).toHaveBeenCalled();
    expect(addEvent).toHaveBeenCalledWith('ticket-1', 'media_attached', { attachmentId: 'att-vid' });
    expect(queueAdd).toHaveBeenCalledWith('open-os', expect.objectContaining({ ticketId: 'ticket-1' }));
    expect(t2.shared.ispboxQueries).toContain('Abertura de OS (enfileirada)');
  });

  it('OS bloqueada sem flag: cria ticket, NÃO enfileira OS e audita create_blocked', async () => {
    const customers = { findByPhone: jest.fn().mockResolvedValue(customer), findOne: jest.fn().mockResolvedValue(customer) } as any;
    const ispbox = { internetStatus: jest.fn().mockResolvedValue({ online: false, status: 'offline' }) } as any;
    const tickets = { create: jest.fn().mockResolvedValue({ id: 'ticket-2' }), addEvent: jest.fn().mockResolvedValue({}) } as any;
    const knowledge = { findSupportProcedure: jest.fn().mockResolvedValue(null) } as any;
    const prisma = { attachment: { create: jest.fn() } } as any;
    const config = { get: jest.fn().mockReturnValue('1') } as any;
    const queueAdd = jest.fn().mockResolvedValue(undefined);
    const ticketQueue = { add: queueAdd } as any;
    const access = { osDecision: jest.fn().mockReturnValue({ allowed: false, simulated: false, reason: 'SUPPORT_ALLOW_OS_CREATION=false' }) } as any;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;

    const flow = new SupportFlow(
      customers, ispbox, new IspboxMapperService(), access, tickets, knowledge,
      new DataExtractorService(), prisma, config, audit, ticketQueue,
    );
    const handlers = flow.handlers();
    const state = new ConversationStateContext('conv-1', { state: S.SUPPORT_IDENTIFICATION });

    await drive(handlers, state, 'Estou sem internet');
    await drive(handlers, state, 'segue o vídeo', [{ id: 'att-vid', type: 'video', filename: 'leds.mp4' }]);

    expect(tickets.create).toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled(); // OS NÃO enfileirada
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'support.os.create_blocked' }));
  });
});
