import { ConfigService } from '@nestjs/config';
import { PilotService } from '../pilot/pilot.service';
import { IspboxAccessService } from './ispbox-access.service';

function make(cfg: Record<string, unknown>) {
  const config = { get: (k: string) => cfg[k] } as unknown as ConfigService;
  const pilot = new PilotService(config);
  return new IspboxAccessService(config, pilot);
}

describe('IspboxAccessService — guardas de escrita', () => {
  it('sandbox: permite porém simulado', () => {
    const d = make({ appMode: 'sandbox' }).paymentDecision('5511999998888');
    expect(d).toMatchObject({ allowed: true, simulated: true });
  });

  it('produção sem flag de pagamento: BLOQUEIA PIX', () => {
    const d = make({ appMode: 'production', 'ispbox.enabled': true, 'financial.allowPaymentActions': false }).paymentDecision('x');
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/FINANCIAL_ALLOW_PAYMENT_ACTIONS/);
  });

  it('produção com flag (sem piloto): PERMITE PIX real', () => {
    const d = make({ appMode: 'production', 'ispbox.enabled': true, 'financial.allowPaymentActions': true, 'pilot.enabled': false }).paymentDecision('x');
    expect(d).toMatchObject({ allowed: true, simulated: false });
  });

  it('produção sem flag de OS: BLOQUEIA OS', () => {
    const d = make({ appMode: 'production', 'ispbox.enabled': true, 'support.allowOsCreation': false }).osDecision('x');
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/SUPPORT_ALLOW_OS_CREATION/);
  });

  it('produção com flag de OS: PERMITE OS', () => {
    const d = make({ appMode: 'production', 'ispbox.enabled': true, 'support.allowOsCreation': true, 'pilot.enabled': false }).osDecision('x');
    expect(d.allowed).toBe(true);
  });

  it('PILOT_MODE: bloqueia telefone fora da allowlist mesmo com flags', () => {
    const cfg = {
      appMode: 'production', 'ispbox.enabled': true,
      'financial.allowPaymentActions': true,
      'pilot.enabled': true, 'pilot.allowIspboxWrite': true, 'pilot.allowedPhones': ['5511988887777'],
    };
    expect(make(cfg).paymentDecision('5511999998888').allowed).toBe(false);
    expect(make(cfg).paymentDecision('5511988887777').allowed).toBe(true);
  });

  it('PILOT_MODE: bloqueia se PILOT_ALLOW_ISPBOX_WRITE=false', () => {
    const d = make({
      appMode: 'production', 'ispbox.enabled': true,
      'financial.allowPaymentActions': true,
      'pilot.enabled': true, 'pilot.allowIspboxWrite': false, 'pilot.allowedPhones': ['5511988887777'],
    }).paymentDecision('5511988887777');
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/PILOT_ALLOW_ISPBOX_WRITE/);
  });

  it('canRead: produção exige ISPBOX_ENABLED', () => {
    expect(make({ appMode: 'production', 'ispbox.enabled': false }).canRead()).toBe(false);
    expect(make({ appMode: 'production', 'ispbox.enabled': true }).canRead()).toBe(true);
    expect(make({ appMode: 'sandbox', 'ispbox.enabled': false }).canRead()).toBe(true);
  });
});
