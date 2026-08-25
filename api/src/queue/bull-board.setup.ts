import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { QUEUES } from './queues.constants';

/**
 * Monta o dashboard BullMQ (bull-board) em /admin/queues.
 * - Com BULL_BOARD_USER/PASSWORD → exige basic auth.
 * - Sem credenciais em produção → NÃO monta o dashboard (loga warning).
 * - Sem credenciais em sandbox → monta sem auth (conveniência de dev).
 */
export function setupBullBoard(app: INestApplication): void {
  const logger = new Logger('BullBoard');
  const config = app.get(ConfigService);
  const sandbox = config.get<string>('appMode') === 'sandbox';
  const user = config.get<string>('bullBoard.user');
  const password = config.get<string>('bullBoard.password');

  const policy = bullBoardPolicy(sandbox, user, password);
  if (!policy.mount) {
    logger.warn(
      'BULL_BOARD_USER/PASSWORD não configurados em produção — dashboard /admin/queues NÃO será montado.',
    );
    return;
  }
  if (!policy.auth) {
    logger.warn('Bull Board sem autenticação (sandbox). Configure BULL_BOARD_USER/PASSWORD.');
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const queues = Object.values(QUEUES).map(
    (name) => new BullMQAdapter(app.get<Queue>(getQueueToken(name))),
  );
  createBullBoard({ queues, serverAdapter });

  if (policy.auth) {
    const jwt = app.get(JwtService, { strict: false });
    app.use('/admin/queues', basicAuth(user!, password!, jwt, config));
  }
  app.use('/admin/queues', serverAdapter.getRouter());
}

/** Decisão de montagem/autenticação do dashboard (pura, testável). */
export function bullBoardPolicy(
  sandbox: boolean,
  user?: string,
  password?: string,
): { mount: boolean; auth: boolean } {
  // Sandbox/piloto controlado: dashboard acessível direto via browser (sem basic-auth),
  // pois a navegação por janela não envia credenciais. (Piloto 0.2 — /admin/queues acessível.)
  if (sandbox) return { mount: true, auth: false };
  // Produção: exige BULL_BOARD_USER/PASSWORD; sem credenciais, NÃO monta (seguro).
  if (!user || !password) return { mount: false, auth: false };
  return { mount: true, auth: true };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function basicAuth(
  user: string,
  password: string,
  jwt?: JwtService,
  config?: ConfigService,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const [scheme, encoded] = header.split(' ');

    // 1) JWT de ADMIN (permite login do painel).
    if (scheme === 'Bearer' && encoded && jwt) {
      try {
        const payload = await jwt.verifyAsync(encoded, {
          secret: config?.get<string>('jwt.secret'),
        });
        if (payload?.role === 'ADMIN') return next();
      } catch {
        /* cai para basic */
      }
    }

    // 2) Basic auth (fallback).
    if (scheme === 'Basic' && encoded) {
      const [u, p] = Buffer.from(encoded, 'base64').toString().split(':');
      if (safeEqual(u ?? '', user) && safeEqual(p ?? '', password)) {
        return next();
      }
    }

    res.set('WWW-Authenticate', 'Basic realm="CentralIA Queues"');
    res.status(401).send('Autenticação necessária.');
  };
}
