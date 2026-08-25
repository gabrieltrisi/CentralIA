import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyService } from '../../common/company/company.service';
import { MockStorageProvider } from '../../common/storage/mock-storage.provider';
import { AttachmentAccessService } from './attachment-access.service';

const ATT = {
  id: 'att-1',
  conversationId: 'conv-1',
  storedName: 'stored.pdf',
  mimeType: 'application/pdf',
  filename: 'boleto.pdf',
};

function makeService() {
  const prisma = {
    attachment: { findUnique: jest.fn().mockResolvedValue(ATT) },
    conversation: { findUnique: jest.fn().mockResolvedValue({ customer: { companyId: 'comp-1' } }) },
  } as unknown as PrismaService;
  const config = {
    get: (k: string) =>
      ({
        'attachments.signingSecret': 'secret',
        'attachments.shareTtlSeconds': 900,
        appMode: 'sandbox',
        'internal.apiKey': '',
      })[k],
  } as unknown as ConfigService;
  const company = { getDefaultCompanyId: jest.fn().mockResolvedValue('comp-default') } as unknown as CompanyService;
  const storage = new MockStorageProvider();
  return new AttachmentAccessService(prisma, config, company, storage);
}

describe('AttachmentAccessService (share-links)', () => {
  const now = 1_750_000_000_000;

  it('share-link válido é aceito', async () => {
    const svc = makeService();
    const link = await svc.createShareLink('att-1', now);
    await expect(svc.assertValidToken('att-1', link.token, now + 1000)).resolves.toBeUndefined();
  });

  it('share-link expirado é rejeitado', async () => {
    const svc = makeService();
    const link = await svc.createShareLink('att-1', now);
    await expect(
      svc.assertValidToken('att-1', link.token, now + 901 * 1000),
    ).rejects.toThrow(ForbiddenException);
  });

  it('token inválido (sem permissão) é rejeitado', async () => {
    const svc = makeService();
    await expect(svc.assertValidToken('att-1', 'lixo.token.aqui', now)).rejects.toThrow(ForbiddenException);
  });

  it('token de outro anexo é rejeitado', async () => {
    const svc = makeService();
    const link = await svc.createShareLink('att-1', now);
    await expect(svc.assertValidToken('att-2', link.token, now + 1000)).rejects.toThrow(ForbiddenException);
  });

  it('download retorna buffer do storage', async () => {
    const svc = makeService();
    // Semeia o storage mock com o conteúdo.
    await svc['storage'].save({ buffer: Buffer.from('PDFDATA'), storedName: 'stored.pdf', mimeType: 'application/pdf' });
    const file = await svc.download('att-1');
    expect(file.buffer.toString()).toBe('PDFDATA');
    expect(file.filename).toBe('boleto.pdf');
  });

  it('assertInternal permite em sandbox sem chave', () => {
    const svc = makeService();
    expect(() => svc.assertInternal(undefined)).not.toThrow();
  });

  it('assertUserAccess permite mesma empresa e bloqueia outra', async () => {
    const svc = makeService();
    await expect(svc.assertUserAccess('att-1', 'comp-1')).resolves.toBeUndefined();
    await expect(svc.assertUserAccess('att-1', 'comp-2')).rejects.toThrow(ForbiddenException);
  });
});
