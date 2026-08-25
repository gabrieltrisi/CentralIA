import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../common/auth/auth.types';
import { LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Credenciais inválidas.');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas.');
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido.');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token não é de refresh.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Usuário não encontrado.');
    return this.issueTokens(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.profile(user);
  }

  /** JWT é stateless: o logout é responsabilidade do cliente (descartar tokens). */
  logout() {
    return { success: true };
  }

  private async issueTokens(user: User) {
    const base: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };
    const secret = this.config.get<string>('jwt.secret');
    const refreshSecret = this.config.get<string>('jwt.refreshSecret') ?? secret;
    const accessToken = await this.jwt.signAsync(
      { ...base, type: 'access' },
      { secret, expiresIn: (this.config.get<string>('jwt.accessTtl') ?? '15m') as any },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...base, type: 'refresh' },
      { secret: refreshSecret, expiresIn: (this.config.get<string>('jwt.refreshTtl') ?? '7d') as any },
    );
    return { accessToken, refreshToken, user: this.profile(user) };
  }

  private profile(user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };
  }
}
