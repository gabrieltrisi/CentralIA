import { CopilotReplyService } from './copilot-reply.service';

function make(summary: any) {
  const summaryService = { build: jest.fn().mockResolvedValue(summary) } as any;
  return new CopilotReplyService(summaryService);
}

const baseSummary = {
  conversationId: 'c1', customerName: 'João Silva', intent: 'COMMERCIAL',
  highlights: [], collectedData: [], pendingItems: [], recommendedNextStep: '', urgency: 'normal',
};

describe('CopilotReplyService (templates determinísticos, nunca auto-envia)', () => {
  it('Comercial com documento pendente → pede RG/CNH/CPF/comprovante', async () => {
    const svc = make({ ...baseSummary, intent: 'COMMERCIAL', pendingItems: ['comprovante de residência'] });
    const r = await svc.suggest('c1', 'comp-1');
    expect(r.suggestion).toMatch(/RG ou CNH/i);
    expect(r.suggestion).toMatch(/comprovante de residência/i);
    expect(r.suggestion).toContain('João'); // [nome]
    expect(r.reasoningLabel).toMatch(/documento/i);
    expect(r.canSendAutomatically).toBe(false);
  });

  it('Comercial com plano escolhido (sem doc pendente) → confirma plano', async () => {
    const svc = make({ ...baseSummary, intent: 'COMMERCIAL', pendingItems: [], highlights: ['Plano: ULTRA 400 MEGA'] });
    const r = await svc.suggest('c1', 'comp-1');
    expect(r.suggestion).toMatch(/ULTRA 400 MEGA/);
    expect(r.reasoningLabel).toMatch(/plano/i);
  });

  it('Suporte sem evidência → pede vídeo dos LEDs', async () => {
    const svc = make({ ...baseSummary, intent: 'SUPPORT', customerName: 'Maria', pendingItems: ['evidência (vídeo/foto dos LEDs)'] });
    const r = await svc.suggest('c1', 'comp-1');
    expect(r.suggestion).toMatch(/vídeo/i);
    expect(r.suggestion).toMatch(/LEDs/);
    expect(r.canSendAutomatically).toBe(false);
  });

  it('Suporte com ticket aberto → mensagem de acompanhamento', async () => {
    const svc = make({ ...baseSummary, intent: 'SUPPORT', highlights: ['Ticket: aberto'] });
    const r = await svc.suggest('c1', 'comp-1', { goal: 'support_followup' });
    expect(r.suggestion).toMatch(/chamado já foi registrado/i);
  });

  it('Financeiro sem PIX → oferece 2ª via/PIX', async () => {
    const svc = make({ ...baseSummary, intent: 'FINANCIAL', customerName: 'Carlos', pendingItems: ['enviar 2ª via / PIX'] });
    const r = await svc.suggest('c1', 'comp-1');
    expect(r.suggestion).toMatch(/segunda via|pix/i);
    expect(r.reasoningLabel).toMatch(/financeiro/i);
  });

  it('Financeiro com PIX gerado → mensagem de baixa', async () => {
    const svc = make({ ...baseSummary, intent: 'FINANCIAL', highlights: ['PIX: gerado'] });
    const r = await svc.suggest('c1', 'comp-1');
    expect(r.suggestion).toMatch(/baixa|processamento financeiro/i);
  });

  it('tone=short encurta; nunca permite envio automático', async () => {
    const svc = make({ ...baseSummary, intent: 'SUPPORT', pendingItems: ['evidência (vídeo/foto dos LEDs)'] });
    const full = await svc.suggest('c1', 'comp-1');
    const short = await svc.suggest('c1', 'comp-1', { tone: 'short' });
    expect(short.suggestion.length).toBeLessThanOrEqual(full.suggestion.length);
    expect(short.canSendAutomatically).toBe(false);
  });
});
