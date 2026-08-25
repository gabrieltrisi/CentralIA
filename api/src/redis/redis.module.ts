import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { redisConnectionOptions } from './redis-connection';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Provides a shared ioredis client (separate from the BullMQ connection)
 * used for general-purpose caching such as the ISPBOX access token.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          ...redisConnectionOptions(config),
          maxRetriesPerRequest: null,
          lazyConnect: false,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
