import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContextStore {
  requestId: string;
  correlationId: string;
  conversationId?: string;
  ticketId?: string;
}

/**
 * Contexto de execução por requisição/job baseado em AsyncLocalStorage.
 * Usado pelo JsonLogger para correlacionar todos os logs (requestId,
 * correlationId, conversationId, ticketId).
 */
export class RequestContext {
  private static als = new AsyncLocalStorage<RequestContextStore>();

  /** Executa `fn` dentro de um novo contexto. */
  static run<T>(seed: Partial<RequestContextStore>, fn: () => T): T {
    const store: RequestContextStore = {
      requestId: seed.requestId ?? randomUUID(),
      correlationId: seed.correlationId ?? seed.requestId ?? randomUUID(),
      conversationId: seed.conversationId,
      ticketId: seed.ticketId,
    };
    return RequestContext.als.run(store, fn);
  }

  static get(): RequestContextStore | undefined {
    return RequestContext.als.getStore();
  }

  /** Atualiza campos do contexto atual (no-op se fora de contexto). */
  static set(patch: Partial<RequestContextStore>): void {
    const store = RequestContext.als.getStore();
    if (store) Object.assign(store, patch);
  }
}
