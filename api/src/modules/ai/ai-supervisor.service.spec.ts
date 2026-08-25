import { AiSupervisorService } from './ai-supervisor.service';
import { AiService } from './ai.service';
import { AgentContext } from './ai.types';

function ctx(message: string): AgentContext {
  return {
    conversationId: 'c1',
    contact: '5511999999999',
    customer: null,
    history: [],
    lastUserMessage: message,
  };
}

describe('AiSupervisorService', () => {
  it('usa fallback por palavra-chave quando a IA não está configurada', async () => {
    const ai = { isEnabled: () => false } as unknown as AiService;
    const supervisor = new AiSupervisorService(ai);

    const support = await supervisor.classify(ctx('minha internet caiu'));
    expect(support.intent).toBe('SUPPORT');

    const financial = await supervisor.classify(ctx('quero a 2 via por pix'));
    expect(financial.intent).toBe('FINANCIAL');

    // "contratar internet fibra" deve ser COMERCIAL, mesmo contendo "internet".
    const commercial = await supervisor.classify(ctx('Quero contratar internet fibra'));
    expect(commercial.intent).toBe('COMMERCIAL');

    // CEP isolado (resposta à pergunta de cobertura) mantém o fluxo comercial.
    const cep = await supervisor.classify(ctx('Meu CEP é 01001-000'));
    expect(cep.intent).toBe('COMMERCIAL');

    const unknown = await supervisor.classify(ctx('asdfgh'));
    expect(unknown).toEqual({ intent: 'HUMAN', confidence: 0 });
  });

  it('classifica a intenção a partir do JSON da IA', async () => {
    const ai = {
      isEnabled: () => true,
      chat: jest.fn().mockResolvedValue('{"intent":"SUPPORT","confidence":0.92}'),
    } as unknown as AiService;
    const supervisor = new AiSupervisorService(ai);

    const result = await supervisor.classify(ctx('estou sem internet'));
    expect(result.intent).toBe('SUPPORT');
    expect(result.confidence).toBeCloseTo(0.92);
  });

  it('recai para HUMAN quando a resposta é inválida', async () => {
    const ai = {
      isEnabled: () => true,
      chat: jest.fn().mockResolvedValue('resposta sem json'),
    } as unknown as AiService;
    const supervisor = new AiSupervisorService(ai);

    const result = await supervisor.classify(ctx('???'));
    expect(result.intent).toBe('HUMAN');
    expect(result.confidence).toBe(0);
  });
});
