import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';

/**
 * Valida a assinatura HMAC-SHA256 do webhook da Meta (`x-hub-signature-256`)
 * usando META_APP_SECRET. Em sandbox, permite bypass se
 * META_WEBHOOK_SIGNATURE_BYPASS=true. Em produção, rejeita inválidos com 401.
 */
@Injectable()
export class MetaSignatureGuard implements CanActivate {
  private readonly logger = new Logger('MetaSignatureGuard');

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const sandbox = this.config.get<string>('appMode') === 'sandbox';
    const bypass = this.config.get<boolean>('meta.webhookSignatureBypass');
    const secret = this.config.get<string>('meta.appSecret');

    if (sandbox && bypass) return true;

    if (!secret) {
      // Sem segredo configurado: em produção é falha de segurança.
      if (sandbox) return true;
      this.logger.error('META_APP_SECRET ausente — rejeitando webhook em produção.');
      throw new UnauthorizedException('Webhook não configurado.');
    }

    const header = req.headers['x-hub-signature-256'] as string | undefined;
    const raw = req.rawBody;
    if (!header || !raw) {
      throw new UnauthorizedException('Assinatura ausente.');
    }

    const expected =
      'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');

    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('Assinatura do webhook inválida.');
      throw new UnauthorizedException('Assinatura inválida.');
    }
    return true;
  }
}
