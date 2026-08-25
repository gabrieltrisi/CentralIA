import { HttpService } from '@nestjs/axios';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Attachment, IntegrationStatus } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationLogService } from '../../common/integration-log/integration-log.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import {
  FileSecurityService,
  MediaKind,
} from '../../common/storage/file-security.service';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../../common/storage/storage.provider';

interface IngestParams {
  conversationId: string;
  messageId?: string;
  mediaId: string;
  type: MediaKind;
  mimeType?: string;
  filename?: string;
}

const DEFAULT_MIME: Record<MediaKind, string> = {
  image: 'image/jpeg',
  document: 'application/pdf',
  video: 'video/mp4',
  audio: 'audio/ogg',
};

/**
 * Baixa a mídia da Meta (ou simula em sandbox), valida, armazena via
 * StorageProvider e cria o Attachment correspondente.
 */
@Injectable()
export class MetaWhatsappMediaService {
  private readonly logger = new Logger(MetaWhatsappMediaService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly security: FileSecurityService,
    private readonly integrationLog: IntegrationLogService,
    private readonly audit: AuditLogService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async ingest(params: IngestParams): Promise<Attachment> {
    const sandbox = this.config.get<string>('appMode') === 'sandbox';
    const { buffer, mimeType } = sandbox
      ? this.mockDownload(params)
      : await this.downloadFromMeta(params);

    // Segurança de arquivos.
    this.security.assertNotExecutable(params.filename);
    this.security.validate(params.type, mimeType, buffer.length);

    // Validação real por magic bytes.
    if (!this.security.matchesMagicBytes(mimeType, buffer)) {
      await this.integrationLog.record({
        provider: 'meta',
        operation: 'MEDIA_REJECTED',
        request: { mediaId: params.mediaId, declaredMime: mimeType },
        response: { reason: 'magic_bytes_mismatch' },
        status: IntegrationStatus.ERROR,
      });
      await this.audit.record({
        actorType: 'meta',
        action: 'media.rejected',
        entityType: 'attachment',
        entityId: params.mediaId,
        metadata: { reason: 'magic_bytes_mismatch', declaredMime: mimeType },
      });
      throw new BadRequestException('Conteúdo do arquivo não corresponde ao tipo informado.');
    }

    const safeOriginal = this.security.sanitizeFilename(params.filename);
    const storedName = this.security.buildStoredName(mimeType);
    const stored = await this.storage.save({ buffer, storedName, mimeType });

    const attachment = await this.prisma.attachment.create({
      data: {
        conversationId: params.conversationId,
        messageId: params.messageId,
        url: stored.url,
        type: params.type,
        mimeType,
        filename: safeOriginal || storedName,
        storedName,
        sizeBytes: buffer.length,
        provider: stored.provider,
        providerMediaId: params.mediaId,
      },
    });

    await this.integrationLog.record({
      provider: 'meta',
      operation: sandbox ? 'sandbox:mediaIngest' : 'mediaIngest',
      request: { mediaId: params.mediaId, type: params.type },
      response: { attachmentId: attachment.id, provider: stored.provider },
      status: IntegrationStatus.SUCCESS,
    });

    return attachment;
  }

  /**
   * Ingestão de um arquivo enviado pelo atendente (já em buffer): valida
   * magic bytes/segurança, armazena e cria o Attachment. Não chama a Meta.
   */
  async ingestUploaded(params: {
    conversationId: string;
    messageId?: string;
    buffer: Buffer;
    mimeType: string;
    filename?: string;
    type: MediaKind;
  }): Promise<Attachment> {
    this.security.assertNotExecutable(params.filename);
    this.security.validate(params.type, params.mimeType, params.buffer.length);

    if (!this.security.matchesMagicBytes(params.mimeType, params.buffer)) {
      await this.integrationLog.record({
        provider: 'meta',
        operation: 'MEDIA_REJECTED',
        request: { declaredMime: params.mimeType, source: 'agent_upload' },
        response: { reason: 'magic_bytes_mismatch' },
        status: IntegrationStatus.ERROR,
      });
      throw new BadRequestException('Conteúdo do arquivo não corresponde ao tipo informado.');
    }

    const safeOriginal = this.security.sanitizeFilename(params.filename);
    const storedName = this.security.buildStoredName(params.mimeType);
    const stored = await this.storage.save({
      buffer: params.buffer,
      storedName,
      mimeType: params.mimeType,
    });

    return this.prisma.attachment.create({
      data: {
        conversationId: params.conversationId,
        messageId: params.messageId,
        url: stored.url,
        type: params.type,
        mimeType: params.mimeType,
        filename: safeOriginal || storedName,
        storedName,
        sizeBytes: params.buffer.length,
        provider: stored.provider,
      },
    });
  }

  /** Sandbox: gera um arquivo simulado (com magic bytes válidos), sem chamar a Meta. */
  private mockDownload(params: IngestParams): { buffer: Buffer; mimeType: string } {
    const mimeType = params.mimeType ?? DEFAULT_MIME[params.type];
    this.logger.log(`[SANDBOX] mídia simulada (${params.type}, ${mimeType})`);
    // Sprint 15.1 (item 9): tamanhos realistas para o sandbox/demo não exibirem "0 KB".
    return { buffer: padBuffer(magicBuffer(mimeType, params.mediaId), MOCK_SIZES[params.type]), mimeType };
  }

  /** Produção: resolve a URL temporária e baixa o binário da Meta. */
  private async downloadFromMeta(
    params: IngestParams,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const version = this.config.get<string>('meta.graphVersion');
    const accessToken = this.config.get<string>('meta.accessToken');
    const headers = { Authorization: `Bearer ${accessToken}` };

    const meta = await firstValueFrom(
      this.http.get<{ url: string; mime_type: string }>(
        `https://graph.facebook.com/${version}/${params.mediaId}`,
        { headers },
      ),
    );

    const file = await firstValueFrom(
      this.http.get<ArrayBuffer>(meta.data.url, {
        headers,
        responseType: 'arraybuffer',
      }),
    );

    return {
      buffer: Buffer.from(file.data),
      mimeType: meta.data.mime_type ?? params.mimeType ?? DEFAULT_MIME[params.type],
    };
  }
}

/** Tamanhos realistas por tipo (sandbox/demo) — item 9 (evita "0 KB"). */
const MOCK_SIZES: Record<MediaKind, number> = {
  image: 120 * 1024, // 120 KB
  document: 80 * 1024, // 80 KB
  video: Math.round(1.8 * 1024 * 1024), // 1.8 MB
  audio: 200 * 1024, // 200 KB
};

/** Completa o buffer (após os magic bytes) até `target` bytes, preservando a assinatura. */
function padBuffer(buf: Buffer, target: number): Buffer {
  if (!target || buf.length >= target) return buf;
  return Buffer.concat([buf, Buffer.alloc(target - buf.length)]);
}

/** Gera um buffer mínimo com magic bytes válidos para o MIME (sandbox/testes). */
export function magicBuffer(mimeType: string, seed = ''): Buffer {
  const pad = Buffer.from(`centralia-mock:${seed}`);
  switch (mimeType) {
    case 'image/jpeg':
      return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), pad]);
    case 'image/png':
      return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pad,
      ]);
    case 'application/pdf':
      return Buffer.concat([Buffer.from('%PDF-1.4\n'), pad]);
    case 'video/mp4':
    case 'video/quicktime':
      return Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from('ftypisom'),
        pad,
      ]);
    case 'audio/ogg':
      return Buffer.concat([Buffer.from('OggS'), pad]);
    default:
      return pad;
  }
}
