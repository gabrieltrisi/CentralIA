import { PrismaService } from '../../prisma/prisma.service';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  it('overview agrega contadores e calcula média de primeira resposta', async () => {
    const created = new Date('2026-06-15T10:00:00Z');
    const responded = new Date('2026-06-15T10:08:00Z'); // 8 min
    const prisma = {
      conversation: { count: jest.fn().mockResolvedValue(3) },
      humanQueue: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ createdAt: created, firstResponseAt: responded }]) // firstResponses
          .mockResolvedValueOnce([{ dueAt: new Date(Date.now() + 60_000) }, { dueAt: new Date(Date.now() - 60_000) }]), // slaItems
      },
      ticket: { count: jest.fn().mockResolvedValue(1) },
      message: { count: jest.fn().mockResolvedValue(42) },
      integrationLog: { count: jest.fn().mockResolvedValue(5) },
      workOrder: { count: jest.fn().mockResolvedValue(4) },
    } as unknown as PrismaService;

    const stats = new StatsService(prisma);
    const res = await stats.overview('comp-1');
    expect(res.mensagensHoje).toBe(42);
    expect(res.mediaPrimeiraRespostaMin).toBe(8);
    expect(res.slaNoPrazo).toBe(1);
    expect(res.slaAtrasado).toBe(1);
    expect(res.pixGeradosHoje).toBe(5);
    expect(res.osAbertasHoje).toBe(4);
  });

  it('sla calcula onTime/late e médias no período', async () => {
    const createdAt = new Date('2026-06-10T10:00:00Z');
    const prisma = {
      humanQueue: {
        findMany: jest.fn().mockResolvedValue([
          {
            createdAt,
            dueAt: new Date('2026-06-10T10:15:00Z'),
            firstResponseAt: new Date('2026-06-10T10:05:00Z'), // 5 min
            resolvedAt: new Date('2026-06-10T10:30:00Z'), // 30 min, > dueAt → late
            status: 'RESOLVED',
          },
        ]),
      },
    } as unknown as PrismaService;
    const stats = new StatsService(prisma);
    const res = await stats.sla('comp-1', {});
    expect(res.total).toBe(1);
    expect(res.late).toBe(1);
    expect(res.averageFirstResponseMinutes).toBe(5);
    expect(res.averageResolutionMinutes).toBe(30);
  });
});
