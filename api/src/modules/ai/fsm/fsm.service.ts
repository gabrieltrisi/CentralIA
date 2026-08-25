import { Injectable, Logger } from '@nestjs/common';
import { ConversationStateValue as S } from '@prisma/client';
import { ConversationStateService } from './conversation-state.service';
import { ConversationStateContext } from './conversation-state-context';
import { CommercialFlow } from './flows/commercial.flow';
import { SupportFlow } from './flows/support.flow';
import { FinancialFlow } from './flows/financial.flow';
import { StateHandler, StepShared } from './flow.types';
import { AgentContext, AgentResult, Intent } from '../ai.types';

/**
 * Máquina de estado persistente (habilitada por USE_FSM).
 *
 * A cada mensagem, executa os handlers de estado em loop — avançando entre
 * estados de "processamento" no mesmo turno — até produzir uma resposta
 * (aguardando o cliente) ou um terminal (escalonamento/encerramento).
 * Os dados coletados são acumulados no ConversationStateContext e persistidos
 * uma única vez ao final do turno.
 */
@Injectable()
export class FsmService {
  private readonly logger = new Logger(FsmService.name);
  private readonly handlers: Partial<Record<S, StateHandler>>;

  constructor(
    private readonly states: ConversationStateService,
    commercial: CommercialFlow,
    support: SupportFlow,
    financial: FinancialFlow,
  ) {
    this.handlers = {
      ...commercial.handlers(),
      ...support.handlers(),
      ...financial.handlers(),
    };
  }

  async handle(
    ctx: AgentContext,
    intent: Intent,
    confidence = 1,
  ): Promise<AgentResult> {
    const context = await this.states.load(ctx.conversationId);
    const shared: StepShared = { ispboxQueries: [], intent, confidence };

    if (context.state === S.START) {
      context.lastIntent = intent;
      context.confidence = confidence;
      context.advanceTo(this.entryStateFor(intent));
    }

    let guard = 0;
    while (guard++ < 20) {
      // Estados terminais alcançados em turnos anteriores.
      if (context.state === S.HUMAN_HANDOFF) {
        await this.states.persist(context);
        return {
          reply: 'Você já está na fila de atendimento humano. Em breve um atendente assume. 🙋',
          ispboxQueries: shared.ispboxQueries,
        };
      }
      if (context.state === S.FINISHED) {
        await this.states.persist(context);
        return {
          reply: 'Atendimento encerrado. Se precisar, é só chamar novamente! 😊',
          ispboxQueries: shared.ispboxQueries,
        };
      }

      const handler = this.handlers[context.state];
      if (!handler) {
        this.logger.warn(`Sem handler para o estado ${context.state} — escalando.`);
        context.advanceTo(S.HUMAN_HANDOFF);
        await this.states.persist(context);
        return {
          reply: 'Vou te transferir para um atendente.',
          escalateReason: 'UNKNOWN_INTENT',
          ispboxQueries: shared.ispboxQueries,
        };
      }

      const step = await handler(context, ctx, shared);
      this.logger.log(`FSM ${ctx.conversationId}: estado=${context.state}`);
      if (step.goto) context.advanceTo(step.goto);

      const terminalOrReply =
        step.reply !== undefined || step.escalateReason || step.finished;
      if (terminalOrReply) {
        await this.states.persist(context);
        return {
          reply: step.reply ?? 'Certo!',
          escalateReason: step.escalateReason,
          ispboxQueries: shared.ispboxQueries,
          outbound: step.outbound,
        };
      }

      if (!step.goto) {
        // Sem progresso — evita loop infinito.
        this.logger.warn(`Handler de ${context.state} não avançou nem respondeu.`);
        break;
      }
    }

    await this.states.persist(context);
    return {
      reply: 'Vou te transferir para um atendente.',
      escalateReason: 'UNKNOWN_INTENT',
      ispboxQueries: shared.ispboxQueries,
    };
  }

  private entryStateFor(intent: Intent): S {
    switch (intent) {
      case 'COMMERCIAL':
        return S.COMMERCIAL_SERVICE_SELECTION;
      case 'SUPPORT':
        return S.SUPPORT_IDENTIFICATION;
      case 'FINANCIAL':
        return S.FINANCIAL_IDENTIFICATION;
      default:
        return S.HUMAN_HANDOFF;
    }
  }
}

export { ConversationStateContext };
