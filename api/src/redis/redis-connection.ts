import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

/**
 * Opções de conexão Redis compartilhadas (client geral + BullMQ).
 * Prioriza REDIS_URL (ex.: Upstash `rediss://default:senha@host:port`),
 * detectando TLS automaticamente; cai para REDIS_HOST/REDIS_PORT/REDIS_PASSWORD.
 */
export function redisConnectionOptions(config: ConfigService): RedisOptions {
  const url = config.get<string>('redis.url');
  if (url) {
    try {
      const u = new URL(url);
      return {
        host: u.hostname,
        port: parseInt(u.port || '6379', 10),
        username: u.username ? decodeURIComponent(u.username) : undefined,
        password: u.password ? decodeURIComponent(u.password) : undefined,
        // Upstash e provedores gerenciados usam TLS (rediss://).
        tls: u.protocol === 'rediss:' ? {} : undefined,
      };
    } catch {
      /* URL inválida → cai para host/port */
    }
  }
  return {
    host: config.get<string>('redis.host'),
    port: config.get<number>('redis.port'),
    password: config.get<string>('redis.password') || undefined,
  };
}
