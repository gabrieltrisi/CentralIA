import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface SuggestReplyInput {
  history: { sender: 'CUSTOMER' | 'AGENT' | 'AI'; content: string }[];
  context?: string;
}

/**
 * Serviço de IA do CentralIA (Claude / Anthropic).
 * Fornece chamadas genéricas (`chat`) usadas pelo supervisor e pelos agentes,
 * além da sugestão de resposta direta ao atendente.
 *
 * Modelo padrão: claude-opus-4-8.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ai.apiKey');
    this.model = this.config.get<string>('ai.model') ?? 'claude-opus-4-8';
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  /** Indica se a IA está configurada (há API key). */
  isEnabled(): boolean {
    return this.client !== null;
  }

  /**
   * Chamada genérica ao Claude com prompt de sistema + mensagem do usuário.
   * Retorna o texto da resposta.
   */
  async chat(params: {
    system: string;
    user: string;
    maxTokens?: number;
  }): Promise<string> {
    if (!this.client) {
      throw new ServiceUnavailableException('IA não configurada (ANTHROPIC_API_KEY).');
    }
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: params.maxTokens ?? 1024,
        system: params.system,
        messages: [{ role: 'user', content: params.user }],
      });
      return message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
    } catch (err) {
      this.logger.error(`Erro na chamada à IA: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Falha na chamada à IA.');
    }
  }

  /** Sugestão de resposta ao atendente (uso direto pelo painel). */
  async suggestReply(input: SuggestReplyInput): Promise<string> {
    const conversation = input.history
      .map((m) => `${m.sender === 'CUSTOMER' ? 'Cliente' : 'Atendente'}: ${m.content}`)
      .join('\n');

    return this.chat({
      system:
        'Você é o assistente de atendimento do CentralIA (provedor de internet). ' +
        'Responda em pt-BR, cordial e objetivo. Nunca invente dados de cobrança ou prazos.',
      user: [
        input.context ? `Contexto:\n${input.context}\n` : '',
        `Conversa:\n${conversation}\n`,
        'Sugira a próxima resposta do atendente ao cliente.',
      ].join('\n'),
    });
  }
}
