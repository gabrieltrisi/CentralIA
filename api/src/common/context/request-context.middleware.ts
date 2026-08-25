import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestContext } from './request-context';

/**
 * Middleware funcional que inicializa o contexto de requisição
 * (requestId/correlationId) e propaga o correlationId via headers.
 * Registrado globalmente em main.ts com `app.use(...)`.
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = randomUUID();
  const correlationId =
    (req.headers['x-correlation-id'] as string) || requestId;

  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', correlationId);

  RequestContext.run({ requestId, correlationId }, () => next());
}
