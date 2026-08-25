import { Injectable } from '@nestjs/common';
import { HumanQueueReason, MessageRole } from '@prisma/client';

export interface SummaryContext {
  customerName?: string | null;
  channel: string;
  reason: HumanQueueReason;
  history: { role: MessageRole; content: string }[];
  ispboxQueries: string[]; // descrições das consultas ISPBOX realizadas
  suggestedNextAction: string;
}

/**
 * Gera o resumo estruturado entregue ao atendente humano na escalonagem.
 * Determinístico (sem IA) para garantir disponibilidade mesmo sem credenciais.
 */
@Injectable()
export class SummaryGeneratorService {
  build(ctx: SummaryContext): string {
    const history = ctx.history
      .slice(-12)
      .map(
        (m) => `- ${m.role === MessageRole.CUSTOMER ? 'Cliente' : 'CentralIA'}: ${m.content}`,
      )
      .join('\n');

    const queries =
      ctx.ispboxQueries.length > 0
        ? ctx.ispboxQueries.map((q) => `- ${q}`).join('\n')
        : '- Nenhuma';

    return [
      `Cliente: ${ctx.customerName ?? 'Não identificado'}`,
      `Canal: ${ctx.channel}`,
      `Motivo: ${ctx.reason}`,
      '',
      'Histórico resumido:',
      history || '- (sem mensagens)',
      '',
      'Consultas ISPBOX realizadas:',
      queries,
      '',
      `Próxima ação sugerida: ${ctx.suggestedNextAction}`,
    ].join('\n');
  }
}
