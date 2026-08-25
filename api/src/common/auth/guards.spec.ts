import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctxWithUser(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function reflector(required?: UserRole[], isPublic?: boolean): Reflector {
  return {
    getAllAndOverride: (key: string) => (key === 'roles' ? required : isPublic),
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('sem @Roles → libera', () => {
    const guard = new RolesGuard(reflector(undefined));
    expect(guard.canActivate(ctxWithUser({ role: UserRole.AGENT }))).toBe(true);
  });

  it('ADMIN passa sempre', () => {
    const guard = new RolesGuard(reflector([UserRole.MANAGER]));
    expect(guard.canActivate(ctxWithUser({ role: UserRole.ADMIN }))).toBe(true);
  });

  it('role permitida passa', () => {
    const guard = new RolesGuard(reflector([UserRole.SUPPORT]));
    expect(guard.canActivate(ctxWithUser({ role: UserRole.SUPPORT }))).toBe(true);
  });

  it('role não permitida → 403', () => {
    const guard = new RolesGuard(reflector([UserRole.FINANCIAL]));
    expect(() => guard.canActivate(ctxWithUser({ role: UserRole.SUPPORT }))).toThrow(ForbiddenException);
  });
});

describe('JwtAuthGuard', () => {
  it('rotas @Public passam sem autenticação', () => {
    const guard = new JwtAuthGuard(reflector(undefined, true));
    expect(guard.canActivate(ctxWithUser(undefined))).toBe(true);
  });
});
