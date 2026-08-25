import { FinancialAgent } from './financial.agent';
import { AiService } from '../ai.service';
import { CustomersService } from '../../customers/customers.service';
import { IspboxService } from '../../ispbox/ispbox.service';
import { AgentContext } from '../ai.types';

const fakeCustomer = {
  id: 'cust-1',
  ispboxId: 'demo-fin',
  name: 'Cliente Demo',
  services: [{ ispboxServiceId: 'svc-1' }],
} as any;

function ctx(): AgentContext {
  return {
    conversationId: 'conv-1',
    contact: '5511900000003',
    customer: fakeCustomer,
    history: [],
    lastUserMessage: 'Quero a segunda via do boleto',
  };
}

describe('FinancialAgent (demo financeiro)', () => {
  it('busca cobrança, gera PIX e PDF, e responde com os dados', async () => {
    const ai = { isEnabled: () => false } as unknown as AiService;
    const customers = {} as unknown as CustomersService;
    const ispbox = {
      listCharges: jest
        .fn()
        .mockResolvedValue([{ id: 'cob-1', valor: 99.9, status: 'vencida', vencimento: '2026-06-01' }]),
      generatePaymentQrCode: jest
        .fn()
        .mockResolvedValue({ copia_cola: '00020126SANDBOX-PIX-cob-1' }),
      chargePaymentPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF sandbox')),
    } as unknown as IspboxService;

    const agent = new FinancialAgent(ai, customers, ispbox);
    const result = await agent.handle(ctx());

    expect(result.ispboxQueries).toEqual(
      expect.arrayContaining([
        'Listagem de cobranças',
        'Geração de QR Code PIX',
        'Geração do PDF do boleto',
      ]),
    );
    expect(result.reply).toContain('cob-1');
    expect(result.reply).toMatch(/PIX/i);
  });
});
