import { Injectable, Logger } from '@nestjs/common';
import { IntegrationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface LogParams {
  provider: string;
  operation: string;
  request?: unknown;
  response?: unknown;
  status: IntegrationStatus;
}

/**
 * Persistência de logs estruturados de integrações externas (IntegrationLog)
 * com fallback para o logger da aplicação. Falhas de persistência nunca
 * propagam — o log é observabilidade, não pode quebrar o fluxo principal.
 */
@Injectable()
export class IntegrationLogService {
  private readonly logger = new Logger('Integration');

  constructor(private readonly prisma: PrismaService) {}

  async record(params: LogParams): Promise<void> {
    const line = `[${params.provider}] ${params.operation} -> ${params.status}`;
    if (params.status === IntegrationStatus.ERROR) {
      this.logger.error(line);
    } else {
      this.logger.log(line);
    }

    try {
      await this.prisma.integrationLog.create({
        data: {
          provider: params.provider,
          operation: params.operation,
          request: this.toJson(params.request),
          response: this.toJson(params.response),
          status: params.status,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao persistir IntegrationLog: ${(err as Error).message}`,
      );
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    try {
      // Garante serializabilidade e remove referências circulares.
      return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    } catch {
      return { value: String(value) } as Prisma.InputJsonValue;
    }
  }
}
