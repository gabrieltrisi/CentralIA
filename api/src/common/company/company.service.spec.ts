import { CompanyService } from './company.service';

function make(overrides: { byName?: any; oldest?: any } = {}) {
  const created: any[] = [];
  const prisma = {
    company: {
      findFirst: jest.fn(({ where, orderBy }: any = {}) => {
        if (where?.name) return Promise.resolve(overrides.byName ?? null);
        if (orderBy) return Promise.resolve(overrides.oldest ?? null);
        return Promise.resolve(null);
      }),
      create: jest.fn(({ data }: any) => {
        const c = { id: 'created-' + created.length, ...data };
        created.push(c);
        return Promise.resolve(c);
      }),
    },
  };
  const config = { get: jest.fn().mockReturnValue('CentralIA') };
  const svc = new CompanyService(prisma as any, config as any);
  return { svc, prisma, created };
}

describe('CompanyService.getDefaultCompanyId (BUG-01)', () => {
  it('retorna a empresa que casa com o nome configurado', async () => {
    const { svc, prisma } = make({ byName: { id: 'by-name' } });
    expect(await svc.getDefaultCompanyId()).toBe('by-name');
    expect(prisma.company.create).not.toHaveBeenCalled();
  });

  it('NÃO cria um segundo tenant: cai para a empresa existente mais antiga', async () => {
    const { svc, prisma } = make({ byName: null, oldest: { id: 'oldest' } });
    expect(await svc.getDefaultCompanyId()).toBe('oldest');
    expect(prisma.company.create).not.toHaveBeenCalled();
  });

  it('só cria empresa quando não existe nenhuma', async () => {
    const { svc, prisma } = make({ byName: null, oldest: null });
    const id = await svc.getDefaultCompanyId();
    expect(prisma.company.create).toHaveBeenCalledTimes(1);
    expect(id).toContain('created-');
  });

  it('cacheia o id (não consulta o banco duas vezes)', async () => {
    const { svc, prisma } = make({ byName: { id: 'by-name' } });
    await svc.getDefaultCompanyId();
    await svc.getDefaultCompanyId();
    expect(prisma.company.findFirst).toHaveBeenCalledTimes(1);
  });
});
