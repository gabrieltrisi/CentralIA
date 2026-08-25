export type CopilotIntent = 'COMMERCIAL' | 'SUPPORT' | 'FINANCIAL' | 'HUMAN' | 'UNKNOWN';
export type CopilotUrgency = 'low' | 'normal' | 'high' | 'urgent';

/** Resumo determinístico da conversa (funciona sem IA externa). */
export interface ConversationSummary {
  conversationId: string;
  customerName: string;
  intent: CopilotIntent;
  intentLabel: string;
  currentSituation: string;
  /** Fatos-chave para exibição (ex.: "Plano: ULTRA 400 MEGA", "CEP: 01001-000"). */
  highlights: string[];
  collectedData: string[];
  pendingItems: string[];
  recommendedNextStep: string;
  urgency: CopilotUrgency;
  handoffReason: string | null;
  lastUpdatedAt: string;
  /** true se a IA externa enriqueceu o texto (sempre false sem ANTHROPIC_API_KEY). */
  aiEnhanced: boolean;
}

export type CopilotTone = 'professional' | 'friendly' | 'short';
export type CopilotGoal =
  | 'continue'
  | 'close'
  | 'ask_document'
  | 'ask_payment'
  | 'support_followup';

export interface SuggestReplyOptions {
  tone?: CopilotTone;
  goal?: CopilotGoal;
}

/** Sugestão de resposta (NUNCA enviada automaticamente). */
export interface CopilotReply {
  suggestion: string;
  reasoningLabel: string;
  confidence: number;
  canSendAutomatically: false;
}
