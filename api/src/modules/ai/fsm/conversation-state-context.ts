import { ConversationStateValue } from '@prisma/client';

/**
 * Contexto acumulado da conversa durante a FSM. Mutado em memória pelos
 * fluxos e persistido de uma vez pelo ConversationStateService ao final do turno.
 */
export class ConversationStateContext {
  state: ConversationStateValue;
  lastIntent?: string;
  confidence?: number;
  historySummary?: string;
  private collected: Record<string, any>;
  private missing: string[];

  constructor(
    public readonly conversationId: string,
    init: {
      state: ConversationStateValue;
      collectedData?: Record<string, any> | null;
      missingFields?: string[] | null;
      lastIntent?: string | null;
      confidence?: number | null;
      historySummary?: string | null;
    },
  ) {
    this.state = init.state;
    this.collected = { ...(init.collectedData ?? {}) };
    this.missing = [...(init.missingFields ?? [])];
    this.lastIntent = init.lastIntent ?? undefined;
    this.confidence = init.confidence ?? undefined;
    this.historySummary = init.historySummary ?? undefined;
  }

  getCollected<T = any>(key: string): T | undefined {
    return this.collected[key];
  }

  setCollected(key: string, value: any): void {
    this.collected[key] = value;
  }

  hasCollected(key: string): boolean {
    const v = this.collected[key];
    return v !== undefined && v !== null && v !== '';
  }

  setMissingFields(fields: string[]): void {
    this.missing = [...fields];
  }

  clearMissingField(field: string): void {
    this.missing = this.missing.filter((f) => f !== field);
  }

  advanceTo(state: ConversationStateValue): void {
    this.state = state;
  }

  finish(): void {
    this.state = ConversationStateValue.FINISHED;
  }

  get collectedData(): Record<string, any> {
    return this.collected;
  }

  get missingFields(): string[] {
    return this.missing;
  }
}
