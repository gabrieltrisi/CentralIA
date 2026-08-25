import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PresenceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface PresenceView {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: string;
}

/**
 * Presença de atendentes (online/away/offline). Apenas persistência —
 * a emissão do evento `user.presence.updated` fica a cargo de quem chama
 * (gateway no connect/disconnect, controller no heartbeat), evitando
 * dependência circular com o EventsService/gateway.
 */
@Injectable()
export class PresenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Atualiza o status e o lastSeenAt do atendente. */
  async set(userId: string, companyId: string, status: PresenceStatus): Promise<PresenceView> {
    const now = new Date();
    const row = await this.prisma.userPresence.upsert({
      where: { userId },
      create: { userId, companyId, status, lastSeenAt: now },
      update: { status, lastSeenAt: now, companyId },
    });
    return this.toView(row);
  }

  markOnline(userId: string, companyId: string) {
    return this.set(userId, companyId, PresenceStatus.ONLINE);
  }

  markOffline(userId: string, companyId: string) {
    return this.set(userId, companyId, PresenceStatus.OFFLINE);
  }

  /** Heartbeat: mantém ONLINE (ou aplica o status informado). */
  heartbeat(userId: string, companyId: string, status: PresenceStatus = PresenceStatus.ONLINE) {
    return this.set(userId, companyId, status);
  }

  /** Lista a presença da empresa, degradando para AWAY/OFFLINE por inatividade. */
  async list(companyId: string): Promise<PresenceView[]> {
    const rows = await this.prisma.userPresence.findMany({ where: { companyId } });
    return rows.map((r) => this.toView(r));
  }

  private toView(row: { userId: string; status: PresenceStatus; lastSeenAt: Date }): PresenceView {
    return {
      userId: row.userId,
      status: this.effectiveStatus(row.status, row.lastSeenAt),
      lastSeenAt: row.lastSeenAt.toISOString(),
    };
  }

  /** Considera AWAY/OFFLINE quando o heartbeat está velho, mesmo sem desconexão limpa. */
  private effectiveStatus(status: PresenceStatus, lastSeenAt: Date, now: Date = new Date()): PresenceStatus {
    if (status === PresenceStatus.OFFLINE) return PresenceStatus.OFFLINE;
    const awayMin = this.config.get<number>('realtime.awayAfterMinutes') ?? 5;
    const ageMin = (now.getTime() - lastSeenAt.getTime()) / 60_000;
    if (ageMin > awayMin * 4) return PresenceStatus.OFFLINE;
    if (ageMin > awayMin) return PresenceStatus.AWAY;
    return status;
  }
}
