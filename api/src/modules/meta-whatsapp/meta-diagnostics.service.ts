import { Injectable } from '@nestjs/common';
import { IntegrationStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PilotService } from '../pilot/pilot.service';

export interface MetaDiagnostics {
  appMode: string;
  pilotMode: boolean;
  pilotAllowedPhonesCount: number;
  meta: {
    verifyTokenConfigured: boolean;
    appSecretConfigured: boolean;
    phoneNumberIdConfigured: boolean;
    accessTokenConfigured: boolean;
    graphVersion: string;
  };
  outbound: { allowed: boolean; reason: string };
  lastEventAt: string | null;
  lastError: { operation: string; at: string; message: string } | null;
}

/**
 * Diagnóstico da integração Meta — apenas BOOLEANOS de configuração (nunca
 * retorna segredos: tokens, app secret, etc.). Inclui último evento recebido,
 * último erro Meta (mensagem truncada) e se o outbound real está permitido.
 */
@Injectable()
export class MetaDiagnosticsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async build(): Promise<MetaDiagnostics> {
    const verifyTokenConfigured = !!this.config.get<string>('meta.verifyToken');
    const appSecretConfigured = !!this.config.get<string>('meta.appSecret');
    const phoneNumberIdConfigured = !!this.config.get<string>('meta.phoneNumberId');
    const accessTokenConfigured = !!this.config.get<string>('meta.accessToken');
    const metaConfigured = accessTokenConfigured && phoneNumberIdConfigured;

    const [lastEvent, lastError] = await Promise.all([
      this.prisma.webhookEvent.findFirst({
        where: { provider: 'meta' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.integrationLog.findFirst({
        where: { provider: 'meta', status: IntegrationStatus.ERROR },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, operation: true, response: true },
      }),
    ]);

    return {
      appMode: this.config.get<string>('appMode') ?? 'live',
      pilotMode: this.pilot.enabled,
      pilotAllowedPhonesCount: this.pilot.allowedPhones.length,
      meta: {
        verifyTokenConfigured,
        appSecretConfigured,
        phoneNumberIdConfigured,
        accessTokenConfigured,
        graphVersion: this.config.get<string>('meta.graphVersion') ?? '',
      },
      outbound: this.pilot.outboundStatus(metaConfigured),
      lastEventAt: lastEvent?.createdAt.toISOString() ?? null,
      lastError: lastError
        ? {
            operation: lastError.operation,
            at: lastError.createdAt.toISOString(),
            message: this.safeMessage(lastError.response),
          }
        : null,
    };
  }

  /** Extrai uma mensagem curta do log de erro, sem vazar payloads/segredos. */
  private safeMessage(response: unknown): string {
    const raw =
      response && typeof response === 'object' && 'message' in (response as Record<string, unknown>)
        ? String((response as Record<string, unknown>).message)
        : 'erro';
    return raw.slice(0, 200);
  }
}
