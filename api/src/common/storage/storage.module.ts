import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileSecurityService } from './file-security.service';
import { STORAGE_PROVIDER, StorageProvider } from './storage.provider';
import { LocalStorageProvider } from './local-storage.provider';
import { MockStorageProvider } from './mock-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';

/**
 * Seleciona o StorageProvider conforme STORAGE_DRIVER/APP_MODE.
 * Regras:
 * - vazio → mock em sandbox, local fora.
 * - local em produção exige ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true.
 */
export function resolveStorageDriver(
  sandbox: boolean,
  driver: string,
  allowLocalInProd: boolean,
): 'mock' | 'local' | 's3' {
  const effective = driver || (sandbox ? 'mock' : 'local');
  if (effective === 'local' && !sandbox && !allowLocalInProd) {
    throw new Error(
      'Local storage proibido em produção. Use STORAGE_DRIVER=s3 ou ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true.',
    );
  }
  if (!['mock', 'local', 's3'].includes(effective)) {
    throw new Error(`STORAGE_DRIVER inválido: ${effective}`);
  }
  return effective as 'mock' | 'local' | 's3';
}

@Global()
@Module({
  providers: [
    FileSecurityService,
    LocalStorageProvider,
    MockStorageProvider,
    S3StorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, LocalStorageProvider, MockStorageProvider, S3StorageProvider],
      useFactory: (
        config: ConfigService,
        local: LocalStorageProvider,
        mock: MockStorageProvider,
        s3: S3StorageProvider,
      ): StorageProvider => {
        const sandbox = config.get<string>('appMode') === 'sandbox';
        const driver = resolveStorageDriver(
          sandbox,
          config.get<string>('storage.driver') ?? '',
          config.get<boolean>('storage.allowLocalInProduction') ?? false,
        );
        new Logger('Storage').log(`StorageProvider=${driver}`);
        return driver === 's3' ? s3 : driver === 'local' ? local : mock;
      },
    },
  ],
  exports: [FileSecurityService, STORAGE_PROVIDER],
})
export class StorageModule {}
