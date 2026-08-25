import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IspboxAuthService } from './auth/ispbox-auth.service';
import { IspboxAccessService } from './ispbox-access.service';

export interface IspboxDiagnostics {
  appMode: string;
  ispboxEnabled: boolean;
  config: {
    baseUrlConfigured: boolean;
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    scopesConfigured: boolean;
    requestIdConfigured: boolean;
  };
  authStatus: 'ok' | 'error' | 'unknown' | 'sandbox';
  lastError: string | null;
  lastRenewedAt: string | null;
  writeFlags: {
    financialPaymentActions: boolean;
    supportOsCreation: boolean;
    pilotMode: boolean;
    pilotAllowIspboxWrite: boolean;
  };
}

/**
 * Diagnóstico da ISPBOX — apenas BOOLEANOS de configuração (nunca expõe
 * baseUrl/clientId/secret/scopes). Status de auth derivado da última renovação.
 */
@Injectable()
export class IspboxDiagnosticsService {
  constructor(
    private readonly config: ConfigService,
    private readonly auth: IspboxAuthService,
    private readonly access: IspboxAccessService,
  ) {}

  build(): IspboxDiagnostics {
    const sandbox = this.config.get<string>('appMode') === 'sandbox';
    let authStatus: IspboxDiagnostics['authStatus'];
    if (sandbox) authStatus = 'sandbox';
    else if (this.auth.lastError) authStatus = 'error';
    else if (this.auth.lastRenewedAt) authStatus = 'ok';
    else authStatus = 'unknown';

    return {
      appMode: this.config.get<string>('appMode') ?? 'live',
      ispboxEnabled: this.access.enabled,
      config: {
        baseUrlConfigured: !!this.config.get<string>('ispbox.baseUrl'),
        clientIdConfigured: !!this.config.get<string>('ispbox.clientId'),
        clientSecretConfigured: !!this.config.get<string>('ispbox.clientSecret'),
        scopesConfigured: !!this.config.get<string>('ispbox.scopes'),
        requestIdConfigured: !!this.config.get<string>('ispbox.requestId'),
      },
      authStatus,
      lastError: this.auth.lastError ? this.auth.lastError.slice(0, 200) : null,
      lastRenewedAt: this.auth.lastRenewedAt?.toISOString() ?? null,
      writeFlags: {
        financialPaymentActions: this.config.get<boolean>('financial.allowPaymentActions') ?? false,
        supportOsCreation: this.config.get<boolean>('support.allowOsCreation') ?? false,
        pilotMode: this.config.get<boolean>('pilot.enabled') ?? false,
        pilotAllowIspboxWrite: this.config.get<boolean>('pilot.allowIspboxWrite') ?? false,
      },
    };
  }

  /** Testa a autenticação sob demanda (botão do painel). Sem expor segredos. */
  async testAuth(): Promise<{ ok: boolean; sandbox?: boolean; reason?: string }> {
    if (this.config.get<string>('appMode') === 'sandbox') {
      return { ok: true, sandbox: true, reason: 'sandbox: ISPBOX usa mock (sem autenticação real)' };
    }
    try {
      const token = await this.auth.getAccessToken();
      return { ok: !!token };
    } catch (err) {
      return { ok: false, reason: (err as Error).message.slice(0, 200) };
    }
  }
}
