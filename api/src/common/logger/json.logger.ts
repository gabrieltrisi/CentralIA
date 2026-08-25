import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { RequestContext } from '../context/request-context';

/**
 * Logger estruturado em JSON. Cada linha inclui o contexto de correlação
 * (requestId, correlationId, conversationId, ticketId) quando disponível.
 */
export class JsonLogger extends ConsoleLogger {
  private write(level: LogLevel, message: unknown, context?: string) {
    const ctx = RequestContext.get();
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? this.context,
      message:
        typeof message === 'string' ? message : safeStringify(message),
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
      conversationId: ctx?.conversationId,
      ticketId: ctx?.ticketId,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  }

  log(message: unknown, context?: string) {
    this.write('log', message, context);
  }
  error(message: unknown, stackOrContext?: string, context?: string) {
    this.write('error', message, context ?? stackOrContext);
  }
  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }
  verbose(message: unknown, context?: string) {
    this.write('verbose', message, context);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
