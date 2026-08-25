import { ConfigService } from '@nestjs/config';
import { PresenceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PresenceService } from './presence.service';

function makeService(rows: any[] = []) {
  const upsert = jest.fn().mockImplementation(({ create, update }) => ({
    userId: create.userId,
    status: update.status ?? create.status,
    lastSeenAt: update.lastSeenAt ?? create.lastSeenAt ?? new Date(),
  }));
  const prisma = {
    userPresence: { upsert, findMany: jest.fn().mockResolvedValue(rows) },
  } as unknown as PrismaService;
  const config = { get: jest.fn().mockReturnValue(5) } as unknown as ConfigService;
  return { svc: new PresenceService(prisma, config), upsert };
}

describe('PresenceService', () => {
  it('markOnline faz upsert com status ONLINE', async () => {
    const { svc, upsert } = makeService();
    const view = await svc.markOnline('u1', 'comp-1');
    expect(upsert).toHaveBeenCalled();
    expect(view.status).toBe(PresenceStatus.ONLINE);
  });

  it('list degrada para AWAY/OFFLINE por inatividade', async () => {
    const fresh = { userId: 'a', status: PresenceStatus.ONLINE, lastSeenAt: new Date() };
    const stale = { userId: 'b', status: PresenceStatus.ONLINE, lastSeenAt: new Date(Date.now() - 10 * 60_000) };
    const old = { userId: 'c', status: PresenceStatus.ONLINE, lastSeenAt: new Date(Date.now() - 60 * 60_000) };
    const { svc } = makeService([fresh, stale, old]);
    const list = await svc.list('comp-1');
    expect(list.find((p) => p.userId === 'a')?.status).toBe(PresenceStatus.ONLINE);
    expect(list.find((p) => p.userId === 'b')?.status).toBe(PresenceStatus.AWAY);
    expect(list.find((p) => p.userId === 'c')?.status).toBe(PresenceStatus.OFFLINE);
  });
});
