import { Injectable } from '@nestjs/common';
import { ConversationSummaryService } from './conversation-summary.service';
import { CopilotReply, CopilotTone, SuggestReplyOptions } from './copilot.types';

/**
 * Sugere uma resposta para o atendente com TEMPLATES determinísticos
 * (não depende de IA externa). A resposta NUNCA é enviada automaticamente —
 * apenas preenche o composer para revisão.
 */
@Injectable()
export class CopilotReplyService {
  constructor(private readonly summaryService: ConversationSummaryService) {}

  async suggest(
    conversationId: string,
    companyId: string,
    opts: SuggestReplyOptions = {},
  ): Promise<CopilotReply> {
    const s = await this.summaryService.build(conversationId, companyId);
    const first = (s.customerName || '').split(' ')[0] || 'cliente';
    const plano = (s.highlights.find((h) => h.startsWith('Plano:')) ?? '').replace('Plano:', '').trim() || 'escolhido';
    const goal = opts.goal ?? 'continue';

    let suggestion = '';
    let reasoningLabel = '';
    let confidence = 0.6;

    const pendingDoc = s.pendingItems.some((p) => /comprovante|documento|rg|cpf/i.test(p));
    const ticketOpen = s.highlights.some((h) => h.startsWith('Ticket:'));
    const pixMentioned = s.highlights.some((h) => h.startsWith('PIX:'));

    // Metas explícitas têm prioridade.
    if (goal === 'close') {
      suggestion = 'Posso ajudar em mais alguma coisa? Se estiver tudo certo, finalizo o atendimento por aqui. Obrigado pelo contato! 🙏';
      reasoningLabel = 'Encerramento';
      confidence = 0.75;
    } else if (goal === 'ask_document' || (s.intent === 'COMMERCIAL' && pendingDoc)) {
      suggestion = `Perfeito, ${first}. Para dar continuidade ao seu cadastro, preciso que envie uma foto do seu RG ou CNH, CPF e comprovante de residência.`;
      reasoningLabel = 'Comercial · documento pendente';
      confidence = 0.85;
    } else if (goal === 'ask_payment' || (s.intent === 'FINANCIAL' && !pixMentioned)) {
      suggestion = 'Identifiquei uma cobrança em aberto. Posso te enviar a segunda via do boleto ou o PIX para pagamento agora.';
      reasoningLabel = 'Financeiro · cobrança em aberto';
      confidence = 0.8;
    } else if (s.intent === 'FINANCIAL' && pixMentioned) {
      suggestion = 'Enviei o PIX para pagamento. Após a confirmação, o sistema seguirá com a baixa conforme o processamento financeiro.';
      reasoningLabel = 'Financeiro · PIX gerado';
      confidence = 0.8;
    } else if (goal === 'support_followup' || (s.intent === 'SUPPORT' && ticketOpen)) {
      suggestion = 'Seu chamado já foi registrado. Nossa equipe seguirá com a análise e, se necessário, encaminhará para atendimento técnico.';
      reasoningLabel = 'Suporte · ticket aberto';
      confidence = 0.82;
    } else if (s.intent === 'SUPPORT') {
      suggestion = `Entendi, ${first}. Já identifiquei sua solicitação de suporte. Pode me enviar um vídeo curto mostrando os LEDs do roteador/ONU para registrarmos a situação?`;
      reasoningLabel = 'Suporte · coletar evidência';
      confidence = 0.8;
    } else if (s.intent === 'COMMERCIAL') {
      suggestion = `Ótima escolha! O plano ${plano} atende bem ao seu perfil. Vou confirmar seus dados e encaminhar para a finalização do cadastro.`;
      reasoningLabel = 'Comercial · plano escolhido';
      confidence = 0.78;
    } else {
      suggestion = `Olá, ${first}! Sou da central de atendimento da ChipNews. Como posso te ajudar hoje?`;
      reasoningLabel = 'Saudação';
      confidence = 0.6;
    }

    return {
      suggestion: applyTone(suggestion, first, opts.tone),
      reasoningLabel,
      confidence,
      canSendAutomatically: false,
    };
  }
}

/** Ajusta o tom (determinístico) sem mudar o conteúdo essencial. */
function applyTone(text: string, first: string, tone?: CopilotTone): string {
  if (tone === 'short') {
    // Mantém a primeira frase (a essência), removendo aberturas longas.
    const firstSentence = text.split(/(?<=[.!?])\s/)[0];
    return firstSentence || text;
  }
  if (tone === 'friendly') {
    // Evita duplicar o nome se já estiver no início.
    return text.startsWith(`Perfeito, ${first}`) || text.startsWith(`Entendi, ${first}`) || text.startsWith('Olá')
      ? `${text} 😊`
      : `Oi, ${first}! 😊 ${text}`;
  }
  return text;
}
