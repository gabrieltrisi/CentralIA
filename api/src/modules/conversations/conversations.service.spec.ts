import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConversationStatus, MessageRole, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyService } from '../../common/company/company.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EventsService } from '../../common/events/events.service';
import { MetaWhatsappSenderService } from '../meta-whatsapp/meta-whatsapp-sender.service';
import { MetaWhatsappMediaService } from '../meta-whatsapp/meta-whatsapp-media.service';
import { ConversationsService } from './conversations.service';

function makeService(conv: any, opts: { targetUser?: any; reads?: any[]; list?: any[] } = {}) {
  const update = jest.fn().mockImplementation(({ data }) => ({ id: 'c1', ...data }));
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  const upsert = jest.fn().mockResolvedValue({});
  const prisma = {
    conversation: {
      findUnique: jest.fn().mockResolvedValue(conv),
      update,
      findMany: jest.fn().mockResolvedValue(opts.list ?? [conv]),
      count: jest.fn().mockResolvedValue((opts.list ?? [conv]).length),
    },
    user: { findUnique: jest.fn().mockResolvedValue(opts.targetUser ?? { id: 'u9', companyId: 'comp-1' }) },
    conversationState: { findUnique: jest.fn().mockResolvedValue(null) },
    conversationRead: { findMany: jest.fn().mockResolvedValue(opts.reads ?? []), upsert },
    humanQueue: { updateMany },
    message: { create: jest.fn().mockReturnValue({}) },
    $transaction: jest.fn().mockResolvedValue([
      { id: 'm1', role: 'AGENT', content: 'oi' },
      { id: 'c1', companyId: 'comp-1' },
    ]),
  } as unknown as PrismaService;
  const company = { getDefaultCompanyId: jest.fn().mockResolvedValue('comp-default') } as unknown as CompanyService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const sender = {
    sendText: jest.fn().mockResolvedValue({ simulated: true }),
    sendImage: jest.fn().mockResolvedValue({ simulated: true }),
    sendDocument: jest.fn().mockResolvedValue({ simulated: true }),
  } as unknown as MetaWhatsappSenderService;
  const media = {
    ingestUploaded: jest.fn().mockResolvedValue({ id: 'att1', url: 'mock://x', filename: 'f.jpg' }),
  } as unknown as MetaWhatsappMediaService;
  const events = { emit: jest.fn() } as unknown as EventsService;
  return { svc: new ConversationsService(prisma, company, audit, sender, media, events), update, updateMany, upsert, audit, sender, media, events };
}

const AGENT = { userId: 'u1', role: UserRole.AGENT, companyId: 'comp-1' };
const conv = (over: any = {}) => ({ id: 'c1', companyId: 'comp-1', status: ConversationStatus.BOT, contact: '5511', assignedUserId: null, messages: [], customer: null, ...over });

describe('ConversationsService', () => {
  it('findOne bloqueia empresa diferente', async () => {
    const { svc } = makeService(conv());
    await expect(svc.findOne('c1', 'comp-2')).rejects.toThrow(ForbiddenException);
  });

  it('assign valida e rejeita atendente de outra empresa', async () => {
    const ok = makeService(conv());
    await ok.svc.assign('c1', 'u9', 'comp-1');
    expect(ok.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { assignedUserId: 'u9' } });

    const bad = makeService(conv(), { targetUser: { id: 'u9', companyId: 'outra' } });
    await expect(bad.svc.assign('c1', 'u9', 'comp-1')).rejects.toThrow(BadRequestException);
  });

  it('sendManualMessage envia, auto-atribui e audita', async () => {
    const { svc, sender, audit } = makeService(conv());
    const res = await svc.sendManualMessage('c1', 'olá', AGENT);
    expect((res.message as any).role).toBe(MessageRole.AGENT);
    expect(sender.sendText).toHaveBeenCalledWith('5511', 'olá');
    const actions = (audit.record as jest.Mock).mock.calls.map((c) => c[0].action);
    expect(actions).toContain('conversation.auto_assign');
    expect(actions).toContain('conversation.message.send');
  });

  it('não auto-atribui quando já há atendente', async () => {
    const { svc, audit } = makeService(conv({ assignedUserId: 'outro' }));
    await svc.sendManualMessage('c1', 'oi', AGENT);
    const actions = (audit.record as jest.Mock).mock.calls.map((c) => c[0].action);
    expect(actions).not.toContain('conversation.auto_assign');
  });

  it('bloqueia AGENT em conversa finalizada; permite ADMIN', async () => {
    const a = makeService(conv({ status: ConversationStatus.CLOSED }));
    await expect(a.svc.sendManualMessage('c1', 'oi', AGENT)).rejects.toThrow(ForbiddenException);

    const b = makeService(conv({ status: ConversationStatus.CLOSED }));
    await b.svc.sendManualMessage('c1', 'oi', { userId: 'a', role: UserRole.ADMIN, companyId: 'comp-1' });
    expect(b.sender.sendText).toHaveBeenCalled();
  });

  it('sendAttachment (imagem) ingere, envia e audita', async () => {
    const { svc, media, sender, audit } = makeService(conv());
    await svc.sendAttachment('c1', { buffer: Buffer.from('x'), mimetype: 'image/jpeg', originalname: 'foto.jpg' }, 'legenda', AGENT);
    expect(media.ingestUploaded).toHaveBeenCalled();
    expect(sender.sendImage).toHaveBeenCalledWith('5511', 'mock://x', 'legenda');
    expect((audit.record as jest.Mock).mock.calls.map((c) => c[0].action)).toContain('conversation.attachment.send');
  });

  it('sendAttachment rejeita tipo não suportado', async () => {
    const { svc } = makeService(conv());
    await expect(
      svc.sendAttachment('c1', { buffer: Buffer.from('x'), mimetype: 'application/zip', originalname: 'a.zip' }, undefined, AGENT),
    ).rejects.toThrow(BadRequestException);
  });

  it('markRead faz upsert de ConversationRead', async () => {
    const { svc, upsert } = makeService(conv());
    await svc.markRead('c1', AGENT);
    expect(upsert).toHaveBeenCalled();
  });

  it('findAll calcula não lidas e aplica escopo do AGENT', async () => {
    const withMsg = conv({ lastMessageAt: new Date() });
    const { svc } = makeService(withMsg, { list: [withMsg], reads: [] });
    const res = await svc.findAll(AGENT);
    expect(res.total).toBe(1);
    expect((res.data[0] as any).unread).toBe(true);
  });

  it('getDetail inclui FSM e respeita empresa', async () => {
    const { svc } = makeService(conv());
    const detail = await svc.getDetail('c1', 'comp-1');
    expect(detail).toHaveProperty('fsm');
    await expect(svc.getDetail('c1', 'comp-2')).rejects.toThrow(ForbiddenException);
  });
});
