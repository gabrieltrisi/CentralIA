import { CommercialAgent } from './commercial.agent';
import { AiService } from '../ai.service';
import { CoverageProvider } from '../coverage/coverage.provider';
import { AgentContext } from '../ai.types';

function ctx(message: string): AgentContext {
  return {
    conversationId: 'c1',
    contact: '5511999999999',
    customer: null,
    history: [],
    lastUserMessage: message,
  };
}

describe('CommercialAgent', () => {
  const ai = {
    isEnabled: () => true,
    chat: jest.fn().mockResolvedValue('Qual serviço você deseja?'),
  } as unknown as AiService;

  const coverage: CoverageProvider = {
    checkByCep: jest.fn().mockResolvedValue({
      covered: true,
      technology: 'FIBER',
      message: 'Há cobertura de fibra.',
    }),
  };

  it('verifica cobertura quando há CEP na mensagem', async () => {
    const agent = new CommercialAgent(ai, coverage);
    const result = await agent.handle(ctx('Meu CEP é 01001-000'));

    expect(coverage.checkByCep).toHaveBeenCalledWith('01001-000');
    expect(result.ispboxQueries).toContain('Verificação de cobertura (CEP 01001-000)');
    expect(result.reply).toBeDefined();
  });

  it('escala para humano quando o cliente pede atendente', async () => {
    const agent = new CommercialAgent(ai, coverage);
    const result = await agent.handle(ctx('quero falar com um atendente'));

    expect(result.escalateReason).toBe('NEGOTIATION');
  });

  // Item 10 — não repetir "Fibra ou Móvel?" quando o serviço já está claro.
  it('mensagem já diz "fibra" → vai direto para o CEP (sem perguntar serviço)', async () => {
    (ai.chat as jest.Mock).mockClear();
    const agent = new CommercialAgent(ai, coverage);
    const result = await agent.handle(ctx('Olá, quero internet fibra'));

    expect(result.reply.toLowerCase()).not.toMatch(/fibra ou (plano )?m[oó]vel/);
    expect(result.reply.toLowerCase()).toContain('cep');
    expect(ai.chat).not.toHaveBeenCalled(); // determinístico, não depende de IA
  });

  it('mensagem já diz "móvel" → segue para plano móvel', async () => {
    const agent = new CommercialAgent(ai, coverage);
    const result = await agent.handle(ctx('quero um plano móvel'));

    expect(result.reply.toLowerCase()).not.toMatch(/fibra ou (plano )?m[oó]vel/);
    expect(result.reply.toLowerCase()).toContain('móvel');
  });
});
