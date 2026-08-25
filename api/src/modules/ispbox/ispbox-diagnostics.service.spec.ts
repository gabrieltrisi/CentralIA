import { ConfigService } from '@nestjs/config';
import { IspboxAuthService } from './auth/ispbox-auth.service';
import { IspboxAccessService } from './ispbox-access.service';
import { IspboxDiagnosticsService } from './ispbox-diagnostics.service';

const SECRETS = {
  'ispbox.baseUrl': 'https://api.ispbox.example/secret-path',
  'ispbox.clientId': 'client-id-super-secret',
  'ispbox.clientSecret': 'CLIENT-SECRET-XYZ',
  'ispbox.scopes': 'read write',
  'ispbox.requestId': 'ispbox',
  'ispbox.enabled': true,
  appMode: 'production',
};

function make(overrides: Record<string, unknown> = {}, auth: Partial<IspboxAuthService> = {}) {
  const cfg = { ...SECRETS, ...overrides };
  const config = { get: (k: string) => cfg[k] } as unknown as ConfigService;
  const authSvc = { lastRenewedAt: null, lastError: null, ...auth } as unknown as IspboxAuthService;
  const access = new IspboxAccessService(config, { enabled: false } as any);
  return new IspboxDiagnosticsService(config, authSvc, access);
}

describe('IspboxDiagnosticsService', () => {
  it('retorna apenas booleanos e NÃO expõe segredos', () => {
    const d = make().build();
    const json = JSON.stringify(d);
    expect(json).not.toContain('client-id-super-secret');
    expect(json).not.toContain('CLIENT-SECRET-XYZ');
    expect(json).not.toContain('secret-path');
    expect(d.config.baseUrlConfigured).toBe(true);
    expect(d.config.clientSecretConfigured).toBe(true);
  });

  it('authStatus = sandbox em APP_MODE=sandbox', () => {
    expect(make({ appMode: 'sandbox' }).build().authStatus).toBe('sandbox');
  });

  it('authStatus = ok quando houve renovação sem erro', () => {
    expect(make({}, { lastRenewedAt: new Date(), lastError: null }).build().authStatus).toBe('ok');
  });

  it('authStatus = error quando há lastError', () => {
    const d = make({}, { lastError: 'connect ECONNREFUSED' }).build();
    expect(d.authStatus).toBe('error');
    expect(d.lastError).toMatch(/ECONNREFUSED/);
  });
});
