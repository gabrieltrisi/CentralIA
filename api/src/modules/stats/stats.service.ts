import { Injectable } from '@nestjs/common';
import {
  ConversationStatus,
  HumanQueueReason,
  HumanQueueStatus,
  TicketStatus,
  WorkOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface OverviewStats {
  conversasAbertas: number;
  aguardandoHumano: number;
  ticketsAbertos: number;
  atendimentosHoje: number;
  mensagensHoje: number;
  mediaPrimeiraRespostaMin: number | null;
  slaNoPrazo: number;
  slaAtrasado: number;
  pixGeradosHoje: number;
  osAbertasHoje: number;
}

export interface SlaStats {
  total: number;
  onTime: number;
  late: number;
  averageFirstResponseMinutes: number | null;
  averageResolutionMinutes: number | null;
}

function startOfToday(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Visão geral da operação (cards do Dashboard). */
  async overview(companyId: string): Promise<OverviewStats> {
    const now = new Date();
    const today = startOfToday(now);

    const [
      conversasAbertas,
      aguardandoHumano,
      ticketsAbertos,
      atendimentosHoje,
      mensagensHoje,
      firstResponses,
      slaItems,
      pixGeradosHoje,
      osAbertasHoje,
    ] = await Promise.all([
      this.prisma.conversation.count({ where: { companyId, status: { not: ConversationStatus.CLOSED } } }),
      this.prisma.humanQueue.count({ where: { conversation: { companyId }, status: HumanQueueStatus.WAITING } }),
      this.prisma.ticket.count({ where: { companyId, status: TicketStatus.OPEN } }),
      this.prisma.conversation.count({ where: { companyId, createdAt: { gte: today } } }),
      this.prisma.message.count({ where: { conversation: { companyId }, createdAt: { gte: today } } }),
      this.prisma.humanQueue.findMany({
        where: { conversation: { companyId }, firstResponseAt: { not: null } },
        select: { createdAt: true, firstResponseAt: true },
      }),
      this.prisma.humanQueue.findMany({
        where: { conversation: { companyId }, status: { not: HumanQueueStatus.RESOLVED } },
        select: { dueAt: true },
      }),
      // IntegrationLog não tem companyId — contagem global do dia (best-effort).
      this.prisma.integrationLog.count({
        where: { operation: { contains: 'PaymentQrCode' }, createdAt: { gte: today } },
      }),
      this.prisma.workOrder.count({
        where: { ticket: { companyId }, status: WorkOrderStatus.OPEN, createdAt: { gte: today } },
      }),
    ]);

    const mediaPrimeiraRespostaMin = avg(
      firstResponses
        .filter((r) => r.firstResponseAt)
        .map((r) => (r.firstResponseAt!.getTime() - r.createdAt.getTime()) / 60_000),
    );

    let slaNoPrazo = 0;
    let slaAtrasado = 0;
    for (const i of slaItems) {
      if (i.dueAt && i.dueAt.getTime() < now.getTime()) slaAtrasado += 1;
      else slaNoPrazo += 1;
    }

    return {
      conversasAbertas,
      aguardandoHumano,
      ticketsAbertos,
      atendimentosHoje,
      mensagensHoje,
      mediaPrimeiraRespostaMin,
      slaNoPrazo,
      slaAtrasado,
      pixGeradosHoje,
      osAbertasHoje,
    };
  }

  /** Métricas de SLA em um período (Dashboard executivo / relatórios). */
  async sla(
    companyId: string,
    params: { startDate?: string; endDate?: string; type?: HumanQueueReason } = {},
  ): Promise<SlaStats> {
    const now = new Date();
    const createdAt =
      params.startDate || params.endDate
        ? {
            ...(params.startDate ? { gte: new Date(params.startDate) } : {}),
            ...(params.endDate ? { lte: new Date(params.endDate) } : {}),
          }
        : undefined;

    const items = await this.prisma.humanQueue.findMany({
      where: {
        conversation: { companyId },
        ...(params.type ? { reason: params.type } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      select: { createdAt: true, dueAt: true, firstResponseAt: true, resolvedAt: true, status: true },
    });

    let onTime = 0;
    let late = 0;
    const frMinutes: number[] = [];
    const resMinutes: number[] = [];

    for (const i of items) {
      const reference = i.resolvedAt ?? now; // resolvidos: no momento da resolução; ativos: agora
      if (i.dueAt && reference.getTime() > i.dueAt.getTime()) late += 1;
      else onTime += 1;
      if (i.firstResponseAt) frMinutes.push((i.firstResponseAt.getTime() - i.createdAt.getTime()) / 60_000);
      if (i.resolvedAt) resMinutes.push((i.resolvedAt.getTime() - i.createdAt.getTime()) / 60_000);
    }

    return {
      total: items.length,
      onTime,
      late,
      averageFirstResponseMinutes: avg(frMinutes),
      averageResolutionMinutes: avg(resMinutes),
    };
  }
}
