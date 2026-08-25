import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { resolveStorageDriver } from '../../common/storage/storage.module';

type Check = 'up' | 'down' | 'configured' | 'not_configured' | 'sandbox' | 'misconfigured';

export interface HealthReport {
  status: 'ok' | 'degraded';
  appMode: string;
  pilotMode: boolean;
  checks: {
    database: Check;
    redis: Check;
    queues: Check;
    storage: string;
    ispbox: Check;
    anthropic: Check;
    meta: Check;
  };
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async check(): Promise<HealthReport> {
    const sandbox = this.config.get<string>('appMode') === 'sandbox';
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const ispbox: Check = sandbox
      ? 'sandbox'
      : this.config.get<string>('ispbox.baseUrl') &&
          this.config.get<string>('ispbox.clientId')
        ? 'configured'
        : 'not_configured';

    const anthropic: Check = this.config.get<string>('ai.apiKey')
      ? 'configured'
      : 'not_configured';

    const meta: Check = sandbox
      ? 'sandbox'
      : this.config.get<string>('meta.accessToken') &&
          this.config.get<string>('meta.phoneNumberId')
        ? 'configured'
        : 'not_configured';

    const status =
      database === 'up' && redis === 'up' ? 'ok' : 'degraded';

    // Filas usam o Redis; storage reflete o driver resolvido (sem efeitos).
    const queues: Check = redis;
    let storage: string;
    try {
      storage = resolveStorageDriver(
        sandbox,
        this.config.get<string>('storage.driver') ?? '',
        this.config.get<boolean>('storage.allowLocalInProduction') ?? false,
      );
    } catch {
      storage = 'misconfigured';
    }

    return {
      status,
      appMode: this.config.get<string>('appMode') ?? 'live',
      pilotMode: this.config.get<boolean>('pilot.enabled') ?? false,
      checks: { database, redis, queues, storage, ispbox, anthropic, meta },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<Check> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<Check> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
