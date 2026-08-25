import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista usuários da empresa (campos básicos). */
  list(companyId: string, filters: { role?: UserRole; active?: boolean }) {
    return this.prisma.user.findMany({
      where: {
        companyId,
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.active !== undefined ? { active: filters.active } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  }
}
