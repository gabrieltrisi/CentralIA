import { ConversationStateValue } from '@prisma/client';
import { AgentContext, AgentResult, Intent, OutboundMessage } from '../ai.types';
import { ConversationStateContext } from './conversation-state-context';

export interface StepShared {
  ispboxQueries: string[];
  intent: Intent;
  confidence: number;
}

/**
 * Resultado de um handler de estado.
 * - `goto` sem `reply`/`escalateReason`/`finished` → avança e reprocessa a mesma
 *   mensagem no próximo estado (no mesmo turno).
 * - com `reply` (e opcional `goto`) → responde e aguarda o cliente.
 * - `escalateReason`/`finished` → encerra o turno (terminal).
 */
export interface StepResult {
  reply?: string;
  goto?: ConversationStateValue;
  escalateReason?: AgentResult['escalateReason'];
  finished?: boolean;
  /** Mensagens ricas (botões/documento) a enviar junto da resposta. */
  outbound?: OutboundMessage[];
}

export type StateHandler = (
  state: ConversationStateContext,
  agent: AgentContext,
  shared: StepShared,
) => Promise<StepResult>;

export interface FsmFlow {
  /** Mapa de estado → handler para esta trilha. */
  handlers(): Partial<Record<ConversationStateValue, StateHandler>>;
}
