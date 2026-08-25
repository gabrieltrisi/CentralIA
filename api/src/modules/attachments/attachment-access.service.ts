import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Attachment } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyService } from '../../common/company/company.service';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../../common/storage/storage.provider';

export interface ShareLink {
  token: string;
  url: string;
  expiresAt: string;
}

/**
 * Acesso seguro a anexos: metadados, download via StorageProvider e
 * share-links temporários assinados (HMAC). Nunca expõe `file://`.
 */
@Injectable()
export class AttachmentAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly company: CompanyService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private async load(id: string): Promise<Attachment> {
    const att = await this.prisma.attachment.findUnique({ where: { id } });
    if (!att) throw new NotFoundException('Anexo não encontrado');
    return att;
  }

  /** Resolve o companyId do anexo (via conversa/cliente, ou empresa padrão). */
  async resolveCompanyId(att: Attachment): Promise<string> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: att.conversationId },
      include: { customer: true },
    });
    return conv?.customer?.companyId ?? (await this.company.getDefaultCompanyId());
  }

  /** Metadados (sem URL física). */
  async getMetadata(id: string) {
    const att = await this.load(id);
    return {
      id: att.id,
      type: att.type,
      mimeType: att.mimeType,
      filename: att.filename,
      sizeBytes: att.sizeBytes,
      provider: att.provider,
      createdAt: att.createdAt,
    };
  }

  /** Conteúdo binário para download. */
  async download(id: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const att = await this.load(id);
    const buffer = await this.storage.read(att.storedName ?? att.filename ?? att.id);
    return {
      buffer,
      mimeType: att.mimeType ?? 'application/octet-stream',
      filename: att.filename ?? `${att.id}.bin`,
    };
  }

  /** Valida que um usuário autenticado pode acessar o anexo (mesma empresa). */
  async assertUserAccess(id: string, companyId: string): Promise<void> {
    const att = await this.load(id);
    const resolved = await this.resolveCompanyId(att);
    if (resolved !== companyId) {
      throw new ForbiddenException('Acesso negado (empresa).');
    }
  }

  /** Cria um share-link temporário (default 15 min). */
  async createShareLink(id: string, nowMs: number): Promise<ShareLink> {
    const att = await this.load(id);
    const companyId = await this.resolveCompanyId(att);
    const ttl = this.config.get<number>('attachments.shareTtlSeconds') ?? 900;
    const exp = Math.floor(nowMs / 1000) + ttl;
    const token = this.sign(att.id, companyId, exp);
    return {
      token,
      url: `/attachments/${att.id}/download?token=${token}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  /** Valida o token de um share-link; lança em caso de inválido/expirado. */
  async assertValidToken(id: string, token: string, nowMs: number): Promise<void> {
    const parts = (token ?? '').split('.');
    if (parts.length !== 4) throw new ForbiddenException('Token inválido.');

    const dec = (s: string) => Buffer.from(s, 'base64url').toString();
    const attId = dec(parts[0]);
    const companyId = dec(parts[1]);
    const exp = parseInt(dec(parts[2]), 10);
    const sig = parts[3];

    if (attId !== id) throw new ForbiddenException('Token não corresponde ao anexo.');
    if (!exp || exp * 1000 < nowMs) throw new ForbiddenException('Link expirado.');

    const att = await this.load(id);
    const resolved = await this.resolveCompanyId(att);
    if (resolved !== companyId) throw new ForbiddenException('Acesso negado (empresa).');

    const expectedSig = this.signature(attId, companyId, exp);
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Assinatura do token inválida.');
    }
  }

  /** Autoriza operação interna (criar share-link). */
  assertInternal(apiKey?: string): void {
    const expected = this.config.get<string>('internal.apiKey');
    const sandbox = this.config.get<string>('appMode') === 'sandbox';
    if (!expected) {
      if (sandbox) return; // conveniência de dev
      throw new ForbiddenException('Operação interna não autorizada.');
    }
    if (apiKey !== expected) throw new ForbiddenException('Chave interna inválida.');
  }

  private sign(attId: string, companyId: string, exp: number): string {
    const enc = (s: string) => Buffer.from(s).toString('base64url');
    const sig = this.signature(attId, companyId, exp);
    return `${enc(attId)}.${enc(companyId)}.${enc(String(exp))}.${sig}`;
  }

  private signature(attId: string, companyId: string, exp: number): string {
    const secret = this.config.get<string>('attachments.signingSecret')!;
    return createHmac('sha256', secret)
      .update(`${attId}:${companyId}:${exp}`)
      .digest('hex');
  }
}
