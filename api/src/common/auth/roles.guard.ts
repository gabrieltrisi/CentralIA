import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AuthUser } from './auth.types';
import { ROLES_KEY } from './decorators';

/** Verifica @Roles(...) contra a role do usuário autenticado. ADMIN passa sempre. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('Não autenticado.');
    if (user.role === UserRole.ADMIN) return true;
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Permissão insuficiente.');
    }
    return true;
  }
}
