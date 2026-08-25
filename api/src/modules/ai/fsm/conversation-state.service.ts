import { Injectable } from '@nestjs/common';
import { ConversationStateValue, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConversationStateContext } from './conversation-state-context';

/**
 * Persistência do estado da conversa (FSM) + carregamento do contexto acumulado.
 */
@Injectable()
export class ConversationStateService {
  constructor(private readonly prisma: PrismaService) {}

  /** Garante que existe um estado (START por padrão) e o retorna. */
  async ensure(conversationId: string) {
    const existing = await this.prisma.conversationState.findUnique({
      where: { conversationId },
    });
    if (existing) return existing;
    return this.prisma.conversationState.create({
      data: { conversationId, state: ConversationStateValue.START },
    });
  }

  get(conversationId: string) {
    return this.prisma.conversationState.findUnique({
      where: { conversationId },
    });
  }

  /** Carrega o contexto acumulado (criando START se necessário). */
  async load(conversationId: string): Promise<ConversationStateContext> {
    const record = await this.ensure(conversationId);
    return new ConversationStateContext(conversationId, {
      state: record.state,
      collectedData: (record.collectedData as Record<string, any>) ?? {},
      missingFields: (record.missingFields as string[]) ?? [],
      lastIntent: record.lastIntent,
      confidence: record.confidence,
      historySummary: record.historySummary,
    });
  }

  /** Persiste o contexto completo. */
  persist(ctx: ConversationStateContext) {
    return this.prisma.conversationState.update({
      where: { conversationId: ctx.conversationId },
      data: {
        state: ctx.state,
        collectedData: ctx.collectedData as Prisma.InputJsonValue,
        missingFields: ctx.missingFields as Prisma.InputJsonValue,
        lastIntent: ctx.lastIntent,
        confidence: ctx.confidence,
        historySummary: ctx.historySummary,
      },
    });
  }

  /** Compat: transição simples de estado (usada por testes/legado). */
  transition(
    conversationId: string,
    state: ConversationStateValue,
    data?: Prisma.InputJsonValue,
  ) {
    return this.prisma.conversationState.upsert({
      where: { conversationId },
      create: { conversationId, state, data },
      update: { state, ...(data !== undefined ? { data } : {}) },
    });
  }
}
