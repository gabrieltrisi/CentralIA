import { ConfigService } from '@nestjs/config';
import { PilotService } from './pilot.service';

function makeService(cfg: Record<string, unknown>) {
  const config = { get: (k: string) => cfg[k] } as unknown as ConfigService;
  return new PilotService(config);
}

describe('PilotService — allowlist de telefones', () => {
  it('permite qualquer telefone quando PILOT_MODE está desligado', () => {
    const svc = makeService({ 'pilot.enabled': false, 'pilot.allowedPhones': [] });
    expect(svc.isPhoneAllowed('5511999998888')).toBe(true);
  });

  it('bloqueia telefone fora da allowlist em PILOT_MODE', () => {
    const svc = makeService({ 'pilot.enabled': true, 'pilot.allowedPhones': ['5511988887777'] });
    expect(svc.isPhoneAllowed('5511999998888')).toBe(false);
  });

  it('permite telefone da allowlist (tolerando formatação/DDI)', () => {
    const svc = makeService({ 'pilot.enabled': true, 'pilot.allowedPhones': ['11988887777'] });
    expect(svc.isPhoneAllowed('+55 (11) 98888-7777')).toBe(true);
  });

  it('bloqueia telefone vazio em PILOT_MODE', () => {
    const svc = makeService({ 'pilot.enabled': true, 'pilot.allowedPhones': ['11988887777'] });
    expect(svc.isPhoneAllowed('')).toBe(false);
  });

  // Item 1 — telefone do piloto: 71991674248 → 5571991674248
  it('permite o telefone do piloto informado sem DDI e com formatação', () => {
    const svc = makeService({ 'pilot.enabled': true, 'pilot.allowedPhones': ['5571991674248'] });
    expect(svc.isPhoneAllowed('71991674248')).toBe(true);
    expect(svc.isPhoneAllowed('(71) 99167-4248')).toBe(true);
    expect(svc.isPhoneAllowed('+55 71 99167-4248')).toBe(true);
    expect(svc.isPhoneAllowed('5571991674248')).toBe(true);
  });
});

describe('PilotService — normalização e máscara de telefone (item 1)', () => {
  const svc = makeService({});

  it('normaliza para E.164 BR (com/sem 55, com símbolos, zeros)', () => {
    expect(svc.normalizeBr('71991674248')).toBe('5571991674248');
    expect(svc.normalizeBr('(71) 99167-4248')).toBe('5571991674248');
    expect(svc.normalizeBr('+55 71 99167-4248')).toBe('5571991674248');
    expect(svc.normalizeBr('5571991674248')).toBe('5571991674248');
    expect(svc.normalizeBr('071991674248')).toBe('5571991674248'); // zero à esquerda
    expect(svc.normalizeBr('')).toBe('');
  });

  it('mascara parcialmente para logs (5571*****248)', () => {
    expect(svc.mask('71991674248')).toBe('5571*****248');
    expect(svc.mask('+55 (71) 99167-4248')).toBe('5571*****248');
    expect(svc.mask('')).toBe('');
  });
});

describe('PilotService — guarda de envio à Meta', () => {
  it('bloqueia sem PILOT_ALLOW_META_SEND', () => {
    const svc = makeService({ 'pilot.allowMetaSend': false, 'pilot.testPhone': '5511999998888', appMode: 'production' });
    expect(svc.metaSendDecision()).toMatchObject({ allowed: false });
  });

  it('bloqueia em sandbox por padrão (sem force)', () => {
    const svc = makeService({
      'pilot.allowMetaSend': true,
      'pilot.testPhone': '5511999998888',
      'pilot.forceSandboxSend': false,
      appMode: 'sandbox',
    });
    const d = svc.metaSendDecision();
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/sandbox/i);
  });

  it('permite (simulado) em sandbox com PILOT_FORCE_SANDBOX_SEND', () => {
    const svc = makeService({
      'pilot.allowMetaSend': true,
      'pilot.testPhone': '5511999998888',
      'pilot.forceSandboxSend': true,
      appMode: 'sandbox',
    });
    expect(svc.metaSendDecision()).toMatchObject({ allowed: true, simulated: true });
  });

  it('permite envio real em produção com a flag', () => {
    const svc = makeService({
      'pilot.allowMetaSend': true,
      'pilot.testPhone': '5511999998888',
      'pilot.forceSandboxSend': false,
      appMode: 'production',
    });
    expect(svc.metaSendDecision()).toMatchObject({ allowed: true, simulated: false });
  });
});

describe('PilotService — outboundStatus', () => {
  it('sandbox = bloqueado/simulado', () => {
    const svc = makeService({ appMode: 'sandbox' });
    expect(svc.outboundStatus(true).allowed).toBe(false);
  });
  it('produção sem Meta = bloqueado', () => {
    const svc = makeService({ appMode: 'production' });
    expect(svc.outboundStatus(false).allowed).toBe(false);
  });
  it('produção com Meta = permitido', () => {
    const svc = makeService({ appMode: 'production' });
    expect(svc.outboundStatus(true).allowed).toBe(true);
  });
});
