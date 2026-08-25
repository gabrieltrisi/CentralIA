import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../common/auth/auth.types';
import { AttachmentAccessService } from './attachment-access.service';

/**
 * Permite acesso ao anexo via:
 *  - share-link temporário (?token=...)  → actor PUBLIC_LINK
 *  - usuário autenticado (Bearer JWT) da mesma empresa → actor USER
 */
@Injectable()
export class AttachmentGuard implements CanActivate {
  constructor(
    private readonly access: AttachmentAccessService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const id = req.params?.id;
    const token = req.query?.token as string | undefined;

    if (token) {
      await this.access.assertValidToken(id, token, Date.now());
      req.attachmentActor = 'PUBLIC_LINK';
      return true;
    }

    const header = req.headers?.authorization as string | undefined;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Autenticação ou token necessários.');
    }
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7), {
        secret: this.config.get<string>('jwt.secret'),
      });
    } catch {
      throw new UnauthorizedException('Token inválido.');
    }
    await this.access.assertUserAccess(id, payload.companyId);
    req.user = { userId: payload.sub, email: payload.email, role: payload.role, companyId: payload.companyId };
    req.attachmentActor = 'USER';
    return true;
  }
}
