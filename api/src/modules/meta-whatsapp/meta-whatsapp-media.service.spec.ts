import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationLogService } from '../../common/integration-log/integration-log.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { FileSecurityService } from '../../common/storage/file-security.service';
import { MockStorageProvider } from '../../common/storage/mock-storage.provider';
import { MetaWhatsappMediaService } from './meta-whatsapp-media.service';

const auditStub = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;

describe('MetaWhatsappMediaService (sandbox)', () => {
  it('ingere mídia mock, valida e cria Attachment sem chamar a Meta', async () => {
    const httpGet = jest.fn();
    const http = { get: httpGet } as unknown as HttpService;
    const config = { get: (k: string) => (k === 'appMode' ? 'sandbox' : undefined) } as unknown as ConfigService;
    const attachmentCreate = jest.fn().mockImplementation(({ data }) => ({ id: 'att-1', ...data }));
    const prisma = { attachment: { create: attachmentCreate } } as unknown as PrismaService;
    const integrationLog = { record: jest.fn().mockResolvedValue(undefined) } as unknown as IntegrationLogService;
    const security = new FileSecurityService();
    const storage = new MockStorageProvider();

    const service = new MetaWhatsappMediaService(http, config, prisma, security, integrationLog, auditStub, storage);

    const att: any = await service.ingest({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      mediaId: 'media-rg',
      type: 'image',
      mimeType: 'image/jpeg',
      filename: 'rg.jpg',
    });

    expect(httpGet).not.toHaveBeenCalled(); // nunca chama a Meta em sandbox
    expect(att.provider).toBe('mock');
    expect(att.type).toBe('image');
    expect(att.providerMediaId).toBe('media-rg');
    expect(attachmentCreate).toHaveBeenCalled();
    expect(integrationLog.record).toHaveBeenCalled();
  });

  it('rejeita executável (segurança de arquivo)', async () => {
    const http = { get: jest.fn() } as unknown as HttpService;
    const config = { get: () => 'sandbox' } as unknown as ConfigService;
    const prisma = { attachment: { create: jest.fn() } } as unknown as PrismaService;
    const integrationLog = { record: jest.fn() } as unknown as IntegrationLogService;
    const service = new MetaWhatsappMediaService(
      http, config, prisma, new FileSecurityService(), integrationLog, auditStub, new MockStorageProvider(),
    );

    await expect(
      service.ingest({ conversationId: 'c', mediaId: 'm', type: 'document', filename: 'malware.exe' }),
    ).rejects.toThrow();
  });
});
