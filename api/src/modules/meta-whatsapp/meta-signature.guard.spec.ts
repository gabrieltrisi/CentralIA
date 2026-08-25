import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { MetaSignatureGuard } from './meta-signature.guard';

function ctxWith(req: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as ExecutionContext;
}

function config(values: Record<string, any>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('MetaSignatureGuard', () => {
  const secret = 'app-secret';
  const raw = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }));
  const validSig = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');

  it('aceita assinatura válida (production)', () => {
    const guard = new MetaSignatureGuard(
      config({ appMode: 'production', 'meta.appSecret': secret, 'meta.webhookSignatureBypass': false }),
    );
    const ok = guard.canActivate(
      ctxWith({ headers: { 'x-hub-signature-256': validSig }, rawBody: raw }),
    );
    expect(ok).toBe(true);
  });

  it('rejeita assinatura inválida (production) com 401', () => {
    const guard = new MetaSignatureGuard(
      config({ appMode: 'production', 'meta.appSecret': secret, 'meta.webhookSignatureBypass': false }),
    );
    expect(() =>
      guard.canActivate(ctxWith({ headers: { 'x-hub-signature-256': 'sha256=deadbeef' }, rawBody: raw })),
    ).toThrow(UnauthorizedException);
  });

  it('rejeita ausência de segredo em production', () => {
    const guard = new MetaSignatureGuard(
      config({ appMode: 'production', 'meta.appSecret': '', 'meta.webhookSignatureBypass': false }),
    );
    expect(() => guard.canActivate(ctxWith({ headers: {}, rawBody: raw }))).toThrow(UnauthorizedException);
  });

  it('permite bypass em sandbox', () => {
    const guard = new MetaSignatureGuard(
      config({ appMode: 'sandbox', 'meta.appSecret': '', 'meta.webhookSignatureBypass': true }),
    );
    expect(guard.canActivate(ctxWith({ headers: {}, rawBody: undefined }))).toBe(true);
  });
});
