import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

const PASSWORD = 'CentralIA@123';

function makeService(user: any) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
  } as unknown as PrismaService;
  const jwt = {
    signAsync: jest.fn().mockImplementation((p: any) => Promise.resolve(`tok-${p.type}`)),
    verifyAsync: jest.fn(),
  } as unknown as JwtService;
  const config = {
    get: (k: string) => ({ 'jwt.secret': 's', 'jwt.accessTtl': '15m', 'jwt.refreshTtl': '7d' })[k],
  } as unknown as ConfigService;
  return { svc: new AuthService(prisma, jwt, config), jwt };
}

describe('AuthService', () => {
  let user: any;
  beforeAll(async () => {
    user = {
      id: 'u1',
      email: 'admin@centralia.local',
      name: 'Admin',
      role: UserRole.ADMIN,
      companyId: 'comp-1',
      passwordHash: await bcrypt.hash(PASSWORD, 10),
    };
  });

  it('login válido retorna access + refresh + perfil', async () => {
    const { svc } = makeService(user);
    const res = await svc.login({ email: user.email, password: PASSWORD });
    expect(res.accessToken).toBe('tok-access');
    expect(res.refreshToken).toBe('tok-refresh');
    expect(res.user).toMatchObject({ email: user.email, role: UserRole.ADMIN, companyId: 'comp-1' });
  });

  it('login com senha errada → 401', async () => {
    const { svc } = makeService(user);
    await expect(svc.login({ email: user.email, password: 'errada' })).rejects.toThrow(UnauthorizedException);
  });

  it('login com usuário inexistente → 401', async () => {
    const { svc } = makeService(null);
    await expect(svc.login({ email: 'x@y.z', password: PASSWORD })).rejects.toThrow(UnauthorizedException);
  });

  it('refresh exige token do tipo refresh', async () => {
    const { svc, jwt } = makeService(user);
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'u1', type: 'access' });
    await expect(svc.refresh('tok')).rejects.toThrow(UnauthorizedException);

    (jwt.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'u1', type: 'refresh' });
    const res = await svc.refresh('tok');
    expect(res.accessToken).toBe('tok-access');
  });

  it('refresh com token inválido/expirado → 401', async () => {
    const { svc, jwt } = makeService(user);
    (jwt.verifyAsync as jest.Mock).mockRejectedValue(new Error('jwt expired'));
    await expect(svc.refresh('garbage')).rejects.toThrow(UnauthorizedException);
  });

  it('refresh de usuário inexistente → 401', async () => {
    const { svc, jwt } = makeService(null); // findUnique → null
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'u1', type: 'refresh' });
    await expect(svc.refresh('tok')).rejects.toThrow(UnauthorizedException);
  });

  it('refresh válido reemite refresh token (reuso permitido — stateless)', async () => {
    const { svc, jwt } = makeService(user);
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'u1', type: 'refresh' });
    const res = await svc.refresh('tok');
    expect(res.refreshToken).toBe('tok-refresh');
    expect(res.user).toMatchObject({ id: 'u1' });
  });
});
