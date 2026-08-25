import { Injectable, Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import { AgentContext, IntentClassification, Intent } from './ai.types';

/**
 * Supervisor de IA: classifica a intenção da conversa e o nível de confiança.
 * Intenções: COMMERCIAL | SUPPORT | FINANCIAL | HUMAN.
 */
@Injectable()
export class AiSupervisorService {
  private readonly logger = new Logger(AiSupervisorService.name);

  private static readonly SYSTEM = [
    'Você é o supervisor de atendimento de um provedor de internet.',
    'Classifique a intenção da última mensagem do cliente em uma destas categorias:',
    '- COMMERCIAL: contratação/planos/cobertura/novo cliente.',
    '- SUPPORT: problemas técnicos, internet lenta/sem conexão, suporte.',
    '- FINANCIAL: cobranças, boletos, PIX, 2ª via, pagamentos.',
    '- HUMAN: pedido explícito de atendente humano, reclamação grave ou negociação.',
    'Responda APENAS um JSON: {"intent":"COMMERCIAL|SUPPORT|FINANCIAL|HUMAN","confidence":0.0-1.0}.',
  ].join(' ');

  constructor(private readonly ai: AiService) {}

  async classify(ctx: AgentContext): Promise<IntentClassification> {
    if (!this.ai.isEnabled()) {
      // Sem IA configurada: classificação determinística por palavras-chave
      // (mantém o sistema operacional/demonstrável sem credenciais).
      return this.keywordFallback(ctx.lastUserMessage);
    }

    const conversation = ctx.history
      .slice(-8)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    try {
      const raw = await this.ai.chat({
        system: AiSupervisorService.SYSTEM,
        user: `Conversa:\n${conversation}\n\nÚltima mensagem do cliente: "${ctx.lastUserMessage}"`,
        maxTokens: 200,
      });
      return this.parse(raw);
    } catch (err) {
      this.logger.warn(`Classificação falhou: ${(err as Error).message}`);
      return { intent: 'HUMAN', confidence: 0 };
    }
  }

  /** Classificador determinístico por palavras-chave (fallback sem IA). */
  private keywordFallback(message: string): IntentClassification {
    const m = message.toLowerCase();
    if (/atendente|humano|reclama|gerente|cancelar contrato/.test(m)) {
      return { intent: 'HUMAN', confidence: 0.9 };
    }

    // Sinais de problema técnico (definem SUPORTE e impedem que a palavra
    // "internet" sozinha derrube uma intenção comercial).
    const problem = /sem conex|sem internet|sem sinal|n[ãa]o (tenho|estou com|funciona|conecta|navega)|caiu|lent[ao]|inst[aá]vel|instabil|travando|oscila|sinal|roteador|onu|wi-?fi|suporte t[eé]cnico/.test(m);

    // Sinais comerciais explícitos (têm prioridade sobre SUPORTE).
    const commercial = /contrat|assinar|aderir|adquirir|migrar|novo cliente|nova linha|quero (um |uma |o |a )?plano|plano(s)?\b|cobertura|viabilidade|or[çc]amento|valor do plano/.test(m);
    const serviceWord = /fibra|m[óo]vel|banda larga|mega|giga/.test(m);

    if (commercial || (serviceWord && !problem)) {
      return { intent: 'COMMERCIAL', confidence: 0.85 };
    }
    if (/cobran|fatura|boleto|pix|2.?via|segunda via|pagar|pagamento|desbloqueio/.test(m)) {
      return { intent: 'FINANCIAL', confidence: 0.85 };
    }
    if (problem || /internet|conex|wifi|wi-fi|suporte|problema/.test(m)) {
      return { intent: 'SUPPORT', confidence: 0.85 };
    }
    if (/\bcep\b|\d{5}-?\d{3}/.test(m)) {
      // CEP isolado no fluxo comercial (ex.: resposta à pergunta de cobertura).
      return { intent: 'COMMERCIAL', confidence: 0.8 };
    }
    return { intent: 'HUMAN', confidence: 0 };
  }

  private parse(raw: string): IntentClassification {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      const json = JSON.parse(match ? match[0] : raw);
      const intent = String(json.intent).toUpperCase() as Intent;
      const valid: Intent[] = ['COMMERCIAL', 'SUPPORT', 'FINANCIAL', 'HUMAN'];
      const confidence = Math.max(0, Math.min(1, Number(json.confidence)));
      if (!valid.includes(intent) || Number.isNaN(confidence)) {
        return { intent: 'HUMAN', confidence: 0 };
      }
      return { intent, confidence };
    } catch {
      return { intent: 'HUMAN', confidence: 0 };
    }
  }
}
