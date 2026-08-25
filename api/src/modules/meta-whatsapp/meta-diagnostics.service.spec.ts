import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PilotService } from '../pilot/pilot.service';
import { MetaDiagnosticsService } from './meta-diagnostics.service';

const SECRETS = {
  'meta.verifyToken': 'verify-secret-123',
  'meta.appSecret': 'app-secret-xyz',
  'meta.phoneNumberId': '123456',
  'meta.accessToken': 'EAAG-super-secret-token',
  'meta.graphVersion': 'v21.0',
  appMode: 'production',
};

function makeService(overrides: Record<string, unknown> = {}) {
  const cfg = { ...SECRETS, ...overrides };
  const config = { get: (k: string) => cfg[k] } as unknown as ConfigService;
  const prisma = {
    webhookEvent: { findFirst: jest.fn().mockResolvedValue({ createdAt: new Date('2026-06-15T10:00:00Z') }) },
    integrationLog: {
      findFirst: jest.fn().mockResolvedValue({
        createdAt: new Date('2026-06-15T11:00:00Z'),
        operation: 'send:text',
        response: { message: 'Request failed 401' },
      }),
    },
  } as unknown as PrismaService;
  const pilot = new PilotService(config);
  return new MetaDiagnosticsService(config, prisma, pilot);
}

describe('MetaDiagnosticsService', () => {
  it('retorna apenas booleanos de config e NÃO expõe segredos', async () => {
    const diag = await makeService().build();
    const json = JSON.stringify(diag);

    // Nenhum segredo bruto pode aparecer no payload.
    expect(json).not.toContain('verify-secret-123');
    expect(json).not.toContain('app-secret-xyz');
    expect(json).not.toContain('EAAG-super-secret-token');

    // Apenas indicadores booleanos de configuração.
    expect(diag.meta.verifyTokenConfigured).toBe(true);
    expect(diag.meta.appSecretConfigured).toBe(true);
    expect(diag.meta.accessTokenConfigured).toBe(true);
    expect(diag.meta.phoneNumberIdConfigured).toBe(true);
    expect(diag.lastEventAt).toBe('2026-06-15T10:00:00.000Z');
    expect(diag.lastError?.operation).toBe('send:text');
  });

  it('marca outbound permitido em produção com Meta configurada', async () => {
    const diag = await makeService().build();
    expect(diag.outbound.allowed).toBe(true);
  });

  it('marca outbound bloqueado em sandbox', async () => {
    const diag = await makeService({ appMode: 'sandbox' }).build();
    expect(diag.outbound.allowed).toBe(false);
    expect(diag.appMode).toBe('sandbox');
  });
});
