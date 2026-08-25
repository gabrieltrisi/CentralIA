/** Nomes das filas da aplicação (sem dependências, evita ciclos de import). */
export const QUEUES = {
  ISPBOX_SYNC: 'ispbox-sync',
  WHATSAPP_INBOUND: 'whatsapp-inbound',
  WHATSAPP_OUTBOUND: 'whatsapp-outbound',
  AI_PROCESSING: 'ai-processing',
  TICKET_PROCESSING: 'ticket-processing',
  DEAD_LETTER: 'dead-letter',
} as const;
