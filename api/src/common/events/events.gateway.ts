import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/auth.types';
import { AuditLogService } from '../audit/audit-log.service';
import { PresenceService } from '../../modules/presence/presence.service';
import { EVENTS } from './events.constants';

/** CORS do handshake — restrito a FRONTEND_URL/CORS_ORIGINS (lido do ambiente). */
const REALTIME_CORS_ORIGINS = (
  process.env.FRONTEND_URL ||
  process.env.CORS_ORIGINS ||
  'http://localhost:3000'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Gateway de tempo real (Socket.IO). Endurecido para produção:
 * - CORS restrito por FRONTEND_URL/CORS_ORIGINS;
 * - rate limit de conexões por IP;
 * - desconecta handshakes sem JWT válido/expirado;
 * - presença (online/offline) por contagem de conexões do atendente;
 * - logs e auditoria opcional de conexão/desconexão.
 * Cada cliente entra apenas na sala da própria empresa (`company:<companyId>`).
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: REALTIME_CORS_ORIGINS, credentials: true },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('EventsGateway');

  /** Conexões ativas por usuário (multi-aba) — controla transições de presença. */
  private readonly userConnCount = new Map<string, number>();
  /** Janela de rate limit por IP. */
  private readonly ipHits = new Map<string, number[]>();

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly presence: PresenceService,
    private readonly audit: AuditLogService,
  ) {}

  async handleConnection(client: Socket) {
    const ip = this.ipOf(client);
    if (this.rateLimited(ip)) {
      this.logger.warn(`Conexão recusada por rate limit (ip ${ip})`);
      client.disconnect();
      return;
    }

    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query?.token as string);
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.secret'),
      });
    } catch {
      client.disconnect(); // token ausente/inválido/expirado
      return;
    }

    client.data.userId = payload.sub;
    client.data.companyId = payload.companyId;
    client.join(`company:${payload.companyId}`);
    this.logger.log(`Conectado: user ${payload.sub} (empresa ${payload.companyId})`);

    const count = (this.userConnCount.get(payload.sub) ?? 0) + 1;
    this.userConnCount.set(payload.sub, count);
    if (count === 1) {
      // Primeira conexão do atendente → ONLINE.
      try {
        const view = await this.presence.markOnline(payload.sub, payload.companyId);
        this.emitPresence(payload.companyId, view.userId, view.status);
      } catch (err) {
        this.logger.warn(`Falha ao marcar presença online: ${(err as Error).message}`);
      }
    }
    await this.maybeAudit('realtime.connect', payload);
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.userId as string | undefined;
    const companyId = client.data?.companyId as string | undefined;
    if (!userId || !companyId) return;
    this.logger.log(`Desconectado: user ${userId} (empresa ${companyId})`);

    const count = Math.max(0, (this.userConnCount.get(userId) ?? 1) - 1);
    if (count === 0) {
      this.userConnCount.delete(userId);
      try {
        const view = await this.presence.markOffline(userId, companyId);
        this.emitPresence(companyId, view.userId, 'OFFLINE');
      } catch (err) {
        this.logger.warn(`Falha ao marcar presença offline: ${(err as Error).message}`);
      }
    } else {
      this.userConnCount.set(userId, count);
    }
    await this.maybeAudit('realtime.disconnect', { sub: userId, companyId } as JwtPayload);
  }

  private emitPresence(companyId: string, userId: string, status: string) {
    this.server?.to(`company:${companyId}`).emit(EVENTS.USER_PRESENCE_UPDATED, { userId, status });
  }

  private ipOf(client: Socket): string {
    const fwd = client.handshake.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
    return client.handshake.address || 'unknown';
  }

  private rateLimited(ip: string): boolean {
    const windowMs = this.config.get<number>('realtime.connWindowMs') ?? 10000;
    const max = this.config.get<number>('realtime.connMaxPerWindow') ?? 30;
    const now = Date.now();
    const hits = (this.ipHits.get(ip) ?? []).filter((t) => now - t < windowMs);
    hits.push(now);
    this.ipHits.set(ip, hits);
    return hits.length > max;
  }

  private async maybeAudit(action: string, payload: JwtPayload) {
    if (!this.config.get<boolean>('realtime.auditConnections')) return;
    await this.audit.record({
      companyId: payload.companyId,
      actorType: 'user',
      actorId: payload.sub,
      action,
      entityType: 'realtime',
    });
  }
}
