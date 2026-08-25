/** Nomes dos eventos de tempo real. Arquivo sem dependências para evitar
 * ciclo de import entre o gateway e o service (ambos só consomem estes nomes). */
export const EVENTS = {
  MESSAGE_CREATED: 'message.created',
  CONVERSATION_UPDATED: 'conversation.updated',
  HUMAN_QUEUE_UPDATED: 'human_queue.updated',
  TICKET_UPDATED: 'ticket.updated',
  USER_PRESENCE_UPDATED: 'user.presence.updated',
} as const;
