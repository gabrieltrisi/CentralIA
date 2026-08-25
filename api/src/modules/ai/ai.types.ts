import { Customer, CustomerService, MessageRole } from '@prisma/client';

export type Intent = 'COMMERCIAL' | 'SUPPORT' | 'FINANCIAL' | 'HUMAN';

/** Cliente com seus serviços (relação opcional conforme a origem). */
export type AgentCustomer = Customer & { services?: CustomerService[] };

export interface IntentClassification {
  intent: Intent;
  confidence: number; // 0..1
}

/** Anexo recebido junto à mensagem atual (já persistido). */
export interface IncomingAttachment {
  id: string;
  type: string; // image | document | video | audio
  mimeType?: string;
  filename?: string;
  caption?: string;
}

export interface AgentContext {
  conversationId: string;
  contact: string;
  customer: AgentCustomer | null;
  history: { role: MessageRole; content: string }[];
  lastUserMessage: string;
  messageType?: string;
  attachments?: IncomingAttachment[];
}

/** Mensagem de saída rica (WhatsApp). */
export type OutboundMessage =
  | { kind: 'text'; text: string }
  | { kind: 'buttons'; body: string; buttons: { id: string; title: string }[] }
  | { kind: 'document'; url: string; filename: string; caption?: string }
  | { kind: 'image'; url: string; caption?: string };

export interface AgentResult {
  /** Resposta a enviar ao cliente (texto persistido no histórico). */
  reply: string;
  /** Se preenchido, a conversa deve ser escalada para humano. */
  escalateReason?:
    | 'CLIENT_REQUEST'
    | 'COMPLEX_SUPPORT'
    | 'NEGOTIATION'
    | 'API_ERROR'
    | 'UNKNOWN_INTENT';
  /** Descrições das consultas ISPBOX realizadas (para o resumo). */
  ispboxQueries?: string[];
  /** Mensagens ricas a enviar (botões, documento, etc.). */
  outbound?: OutboundMessage[];
}
