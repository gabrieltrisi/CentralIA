import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanQueueReason, MessageRole } from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUES } from '../../queue/queue.module';
import { ConversationsService } from '../conversations/conversations.service';
import { CustomersService } from '../customers/customers.service';
import { HumanQueueService } from '../human-queue/human-queue.service';
import { SummaryGeneratorService } from '../human-queue/summary-generator.service';
import { AiSupervisorService } from './ai-supervisor.service';
import { CommercialAgent } from './agents/commercial.agent';
import { FinancialAgent } from './agents/financial.agent';
import { SupportAgent } from './agents/support.agent';
import { FsmService } from './fsm/fsm.service';
import { RequestContext } from '../../common/context/request-context';
import { AgentContext, AgentResult, IncomingAttachment } from './ai.types';

/**
 * Orquestra o fluxo WhatsApp → Supervisor → Agente → Resposta → Escalonamento.
 * Persiste todas as mensagens e enfileira o envio outbound.
 */
@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);
  private readonly threshold: number;
  private readonly useFsm: boolean;

  constructor(
    private readonly conversations: ConversationsService,
    private readonly customers: CustomersService,
    private readonly supervisor: AiSupervisorService,
    private readonly commercial: CommercialAgent,
    private readonly support: SupportAgent,
    private readonly financial: FinancialAgent,
    private readonly fsm: FsmService,
    private readonly humanQueue: HumanQueueService,
    private readonly summary: SummaryGeneratorService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.WHATSAPP_OUTBOUND) private readonly outbound: Queue,
  ) {
    this.threshold = this.config.get<number>('supervisor.confidenceThreshold') ?? 0.7;
    this.useFsm = this.config.get<boolean>('useFsm') ?? false;
  }

  /**
   * Processa uma mensagem recebida já persistida. Conduz a IA ou escala humano.
   */
  async handleIncoming(
    conversationId: string,
    lastUserMessage: string,
    incoming?: { type?: string; attachments?: IncomingAttachment[] },
  ) {
    RequestContext.set({ conversationId });
    const conversation = await this.conversations.findOne(conversationId);

    // Conversa já em atendimento humano: não intervir.
    if (conversation.status === 'HUMAN') {
      this.logger.log(`Conversa ${conversationId} em atendimento humano — ignorada pela IA.`);
      return;
    }

    // Carrega o cliente já com os serviços (relação necessária aos agentes).
    const customer = conversation.customerId
      ? await this.customers.findOne(conversation.customerId)
      : conversation.contact
        ? await this.customers.findByPhone(conversation.contact)
        : null;

    const history = conversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const ctx: AgentContext = {
      conversationId,
      contact: conversation.contact ?? '',
      customer,
      history,
      lastUserMessage,
      messageType: incoming?.type,
      attachments: incoming?.attachments,
    };

    const classification = await this.supervisor.classify(ctx);
    this.logger.log(
      `Conversa ${conversationId}: intent=${classification.intent} conf=${classification.confidence}`,
    );

    // Persiste a intenção para roteamento por área (RBAC fino).
    const intent = classification.intent;
    const companyId = conversation.companyId;
    await this.conversations.setIntent(conversationId, intent).catch(() => undefined);

    // Confiança baixa ou intenção humana → escalonar.
    if (intent === 'HUMAN' || classification.confidence < this.threshold) {
      const reason: HumanQueueReason =
        intent === 'HUMAN' ? HumanQueueReason.CLIENT_REQUEST : HumanQueueReason.UNKNOWN_INTENT;
      await this.escalate(ctx, reason, [], intent, companyId);
      await this.reply(ctx, 'Um momento, vou te conectar com um de nossos atendentes.');
      return;
    }

    let result: AgentResult;
    try {
      result = this.useFsm
        ? await this.fsm.handle(ctx, intent, classification.confidence)
        : await this.route(intent, ctx);
    } catch (err) {
      this.logger.error(`Agente falhou: ${(err as Error).message}`);
      await this.escalate(ctx, HumanQueueReason.API_ERROR, [], intent, companyId);
      await this.reply(ctx, 'Tive um problema técnico aqui. Vou te transferir para um atendente.');
      return;
    }

    await this.reply(ctx, result.reply, result.outbound);

    if (result.escalateReason) {
      await this.escalate(
        ctx,
        result.escalateReason as HumanQueueReason,
        result.ispboxQueries ?? [],
        intent,
        companyId,
      );
    }
  }

  private route(intent: string, ctx: AgentContext): Promise<AgentResult> {
    switch (intent) {
      case 'COMMERCIAL':
        return this.commercial.handle(ctx);
      case 'SUPPORT':
        return this.support.handle(ctx);
      case 'FINANCIAL':
        return this.financial.handle(ctx);
      default:
        return Promise.resolve({
          reply: 'Vou te transferir para um atendente.',
          escalateReason: 'UNKNOWN_INTENT',
        });
    }
  }

  /** Persiste a resposta da IA e enfileira o envio (texto ou mensagens ricas). */
  private async reply(ctx: AgentContext, text: string, outbound?: AgentResult['outbound']) {
    await this.conversations.addMessage({
      conversationId: ctx.conversationId,
      role: MessageRole.AI,
      content: text,
    });
    if (!ctx.contact) return;

    if (outbound?.length) {
      for (const msg of outbound) {
        await this.outbound.add('send', { to: ctx.contact, ...msg });
      }
    } else {
      await this.outbound.add('send', { to: ctx.contact, kind: 'text', text });
    }
  }

  private async escalate(
    ctx: AgentContext,
    reason: HumanQueueReason,
    ispboxQueries: string[],
    intent?: string,
    companyId?: string | null,
  ) {
    const summary = this.summary.build({
      customerName: ctx.customer?.name,
      channel: 'WHATSAPP',
      reason,
      history: ctx.history,
      ispboxQueries,
      suggestedNextAction:
        reason === HumanQueueReason.API_ERROR
          ? 'Verificar integração e retomar o atendimento.'
          : 'Assumir a conversa e dar continuidade ao atendimento.',
    });
    await this.humanQueue.enqueue({
      conversationId: ctx.conversationId,
      reason,
      summary,
      intent,
      companyId,
    });
  }
}
