import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { SupportAgent } from './support.agent';
import { AiService } from '../ai.service';
import { CustomersService } from '../../customers/customers.service';
import { IspboxService } from '../../ispbox/ispbox.service';
import { TicketsService } from '../../tickets/tickets.service';
import { AgentContext } from '../ai.types';

const fakeCustomer = {
  id: 'cust-1',
  ispboxId: 'demo-sup',
  name: 'Cliente Demo',
  services: [{ ispboxServiceId: 'svc-1' }],
} as any;

function ctx(): AgentContext {
  return {
    conversationId: 'conv-1',
    contact: '5511900000002',
    customer: null,
    history: [],
    lastUserMessage: 'Estou sem internet',
  };
}

describe('SupportAgent (demo suporte)', () => {
  it('com status offline: cria ticket, enfileira OS e pede vídeo', async () => {
    const ai = { isEnabled: () => false } as unknown as AiService;
    const customers = {
      findByPhone: jest.fn().mockResolvedValue(fakeCustomer),
    } as unknown as CustomersService;
    const ispbox = {
      internetStatus: jest.fn().mockResolvedValue({ online: false, status: 'offline' }),
    } as unknown as IspboxService;
    const tickets = {
      create: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
    } as unknown as TicketsService;
    const config = { get: jest.fn().mockReturnValue('1') } as unknown as ConfigService;
    const ticketQueue = { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue;

    const agent = new SupportAgent(ai, customers, ispbox, tickets, config, ticketQueue);
    const result = await agent.handle(ctx());

    expect(tickets.create).toHaveBeenCalled();
    expect(ticketQueue.add).toHaveBeenCalledWith('open-os', expect.objectContaining({ ticketId: 'ticket-1' }));
    expect(result.ispboxQueries).toContain('Abertura de OS (enfileirada)');
    expect(result.reply).toMatch(/vídeo|chamado/i);
  });
});
