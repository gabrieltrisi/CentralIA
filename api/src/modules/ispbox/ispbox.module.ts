import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IspboxController } from './ispbox.controller';
import { IspboxService } from './ispbox.service';
import { MockIspboxService } from './mock-ispbox.service';
import { IspboxAuthService } from './auth/ispbox-auth.service';
import { IspboxHttpService } from './http/ispbox-http.service';
import { IspboxMapperService } from './ispbox-mapper.service';
import { IspboxAccessService } from './ispbox-access.service';
import { IspboxActionsService } from './ispbox-actions.service';
import { IspboxDiagnosticsService } from './ispbox-diagnostics.service';
import { IntegrationLogService } from '../../common/integration-log/integration-log.service';

/**
 * Módulo de integração com a API ISPBOX V2 (oficial).
 *
 * Em APP_MODE=sandbox o token IspboxService resolve para MockIspboxService,
 * que não realiza chamadas reais (não abre OS, não altera dados ISPBOX).
 */
@Module({
  imports: [
    ConfigModule,
    HttpModule.register({ timeout: 20000, maxRedirects: 3 }),
  ],
  controllers: [IspboxController],
  providers: [
    IspboxAuthService,
    IspboxHttpService,
    IspboxMapperService,
    IspboxAccessService,
    IspboxActionsService,
    IspboxDiagnosticsService,
    {
      provide: IspboxService,
      inject: [IspboxHttpService, ConfigService, IntegrationLogService],
      useFactory: (
        http: IspboxHttpService,
        config: ConfigService,
        integrationLog: IntegrationLogService,
      ) =>
        config.get<string>('appMode') === 'sandbox'
          ? new MockIspboxService(http, integrationLog)
          : new IspboxService(http),
    },
  ],
  exports: [
    IspboxService,
    IspboxHttpService,
    IspboxAuthService,
    IspboxMapperService,
    IspboxAccessService,
    IspboxActionsService,
  ],
})
export class IspboxModule {}
