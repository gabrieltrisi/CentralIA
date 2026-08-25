import { WhatsappInboundProcessor } from './whatsapp-inbound.processor';
import { MetaWhatsappMessageParser } from '../modules/meta-whatsapp/meta-whatsapp-message.parser';

function makeProcessor(overrides: Record<string, any> = {}) {
  const deps = {
    meta: { markProcessed: jest.fn().mockResolvedValue({}) },
    parser: {
      parse: jest.fn().mockReturnValue([
        { providerMessageId: 'wamid.1', waId: '5511999998888', from: 'x', type: 'text', text: 'oi', rawPayload: {} },
      ]),
    },
    media: { ingest: jest.fn() },
    conversations: {
      findOrCreateByContact: jest.fn().mockResolvedValue({ id: 'conv-1' }),
      addMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    },
    customers: { findByPhone: jest.fn().mockResolvedValue(null) },
    orchestrator: { handleIncoming: jest.fn().mockResolvedValue(undefined) },
    prisma: { message: { findUnique: jest.fn().mockResolvedValue(null) } },
    audit: { record: jest.fn().mockResolvedValue(undefined) },
    deadLetter: { handleFailure: jest.fn() },
    pilot: { isPhoneAllowed: jest.fn().mockReturnValue(true), mask: jest.fn((p: string) => p) },
    ...overrides,
  };
  const proc = new WhatsappInboundProcessor(
    deps.meta as any, deps.parser as any, deps.media as any, deps.conversations as any,
    deps.customers as any, deps.orchestrator as any, deps.prisma as any, deps.audit as any, deps.deadLetter as any,
    deps.pilot as any,
  );
  return { proc, deps };
}

describe('WhatsappInboundProcessor — idempotência', () => {
  it('processa mensagem nova normalmente', async () => {
    const { proc, deps } = makeProcessor();
    await proc.process({ data: { webhookEventId: 'w1', payload: {} } } as any);
    expect(deps.conversations.addMessage).toHaveBeenCalled();
    expect(deps.orchestrator.handleIncoming).toHaveBeenCalledWith('conv-1', 'oi', expect.any(Object));
  });

  it('PILOT_MODE: telefone não permitido não cria mensagem nem aciona FSM', async () => {
    const { proc, deps } = makeProcessor({
      pilot: { isPhoneAllowed: jest.fn().mockReturnValue(false), mask: jest.fn((p: string) => p) },
    });
    await proc.process({ data: { webhookEventId: 'w1', payload: {} } } as any);

    expect(deps.conversations.addMessage).not.toHaveBeenCalled();
    expect(deps.orchestrator.handleIncoming).not.toHaveBeenCalled();
    expect(deps.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pilot.phone_not_allowed' }),
    );
    // O evento ainda é marcado como processado.
    expect(deps.meta.markProcessed).toHaveBeenCalled();
  });

  it('PILOT_MODE: telefone permitido processa normalmente', async () => {
    const { proc, deps } = makeProcessor({
      pilot: { isPhoneAllowed: jest.fn().mockReturnValue(true), mask: jest.fn((p: string) => p) },
    });
    await proc.process({ data: { webhookEventId: 'w1', payload: {} } } as any);
    expect(deps.conversations.addMessage).toHaveBeenCalled();
    expect(deps.orchestrator.handleIncoming).toHaveBeenCalled();
  });

  // BUG-01 — fluxo ponta a ponta a partir de um payload REAL da Meta
  // (payload → parser → conversa criada → mensagem → orquestrador).
  it('payload WhatsApp real → cria conversa e mensagem do cliente', async () => {
    const findOrCreateByContact = jest.fn().mockResolvedValue({ id: 'conv-e2e' });
    const addMessage = jest.fn().mockResolvedValue({ id: 'msg-e2e' });
    const handleIncoming = jest.fn().mockResolvedValue(undefined);
    const { proc, deps } = makeProcessor({
      parser: new MetaWhatsappMessageParser(), // parser real, sem mock
      conversations: { findOrCreateByContact, addMessage },
      orchestrator: { handleIncoming },
    });

    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'WABA',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '5511999999999', phone_number_id: 'PNID' },
            contacts: [{ profile: { name: 'Cliente' }, wa_id: '5511970009999' }],
            messages: [{ from: '5511970009999', id: 'wamid.E2E1', timestamp: '1700000000', type: 'text', text: { body: 'Quero internet fibra' } }],
          },
        }],
      }],
    };

    const res: any = await proc.process({ data: { webhookEventId: 'w-e2e', payload } } as any);

    expect(findOrCreateByContact).toHaveBeenCalledWith('5511970009999', undefined, undefined);
    expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-e2e', content: 'Quero internet fibra', externalId: 'wamid.E2E1',
    }));
    expect(handleIncoming).toHaveBeenCalledWith('conv-e2e', 'Quero internet fibra', expect.any(Object));
    expect(deps.meta.markProcessed).toHaveBeenCalledWith('w-e2e');
    expect(res).toEqual({ processed: 1 });
  });

  it('ignora webhook duplicado (mesmo providerMessageId) sem reprocessar', async () => {
    const { proc, deps } = makeProcessor({
      prisma: { message: { findUnique: jest.fn().mockResolvedValue({ id: 'existing' }) } },
    });
    await proc.process({ data: { webhookEventId: 'w1', payload: {} } } as any);

    expect(deps.conversations.addMessage).not.toHaveBeenCalled();
    expect(deps.orchestrator.handleIncoming).not.toHaveBeenCalled();
    expect(deps.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'webhook.duplicate_ignored' }),
    );
  });
});
