import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('lista usuários escopados por empresa com campos básicos', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'u1', name: 'Admin' }]);
    const prisma = { user: { findMany } } as unknown as PrismaService;
    const svc = new UsersService(prisma);

    await svc.list('comp-1', { role: UserRole.SUPPORT, active: true });

    expect(findMany).toHaveBeenCalledWith({
      where: { companyId: 'comp-1', role: UserRole.SUPPORT, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  });

  it('sem filtros lista todos da empresa', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { user: { findMany } } as unknown as PrismaService;
    const svc = new UsersService(prisma);
    await svc.list('comp-1', {});
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'comp-1' } }));
  });
});
