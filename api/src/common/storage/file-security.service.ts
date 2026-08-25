import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/** Categorias de mídia suportadas. */
export type MediaKind = 'image' | 'document' | 'video' | 'audio';

const MAX_SIZE: Record<MediaKind, number> = {
  image: 5 * 1024 * 1024, // 5 MB
  document: 10 * 1024 * 1024, // 10 MB
  video: 20 * 1024 * 1024, // 20 MB
  audio: 10 * 1024 * 1024, // 10 MB
};

const ALLOWED_MIME: Record<MediaKind, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  document: ['application/pdf'],
  video: ['video/mp4', 'video/quicktime'],
  audio: ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac'],
};

const BLOCKED_EXT = [
  '.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.sh', '.js', '.jar',
  '.ps1', '.vbs', '.dll', '.app', '.deb', '.rpm',
];

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
};

/**
 * Segurança de arquivos: valida tamanho/mime, bloqueia executáveis,
 * sanitiza nomes e gera um nome de armazenamento baseado em UUID.
 */
@Injectable()
export class FileSecurityService {
  /** Valida mime e tamanho de acordo com a categoria. Lança em caso de erro. */
  validate(kind: MediaKind, mimeType: string, sizeBytes: number): void {
    const allowed = ALLOWED_MIME[kind];
    if (!allowed) throw new BadRequestException(`Tipo de mídia não suportado: ${kind}`);
    if (!allowed.includes(mimeType)) {
      throw new BadRequestException(`MIME não permitido para ${kind}: ${mimeType}`);
    }
    if (sizeBytes > MAX_SIZE[kind]) {
      throw new BadRequestException(
        `Arquivo excede o tamanho máximo de ${Math.round(MAX_SIZE[kind] / 1024 / 1024)}MB.`,
      );
    }
  }

  /** Remove caminho/caracteres perigosos do nome recebido. */
  sanitizeFilename(name?: string): string {
    if (!name) return '';
    const base = name.replace(/^.*[\\/]/, '').trim();
    return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  }

  /** Garante que o nome não tem extensão executável. */
  assertNotExecutable(name?: string): void {
    const lower = (name ?? '').toLowerCase();
    if (BLOCKED_EXT.some((ext) => lower.endsWith(ext))) {
      throw new BadRequestException('Tipo de arquivo executável bloqueado.');
    }
  }

  /** Gera o nome final de armazenamento (UUID + extensão pelo mime). */
  buildStoredName(mimeType: string): string {
    const ext = EXT_BY_MIME[mimeType] ?? '.bin';
    return `${randomUUID()}${ext}`;
  }

  /**
   * Confere a assinatura binária (magic bytes) contra o MIME informado.
   * Cobre JPEG, PNG, PDF, WEBP e MP4/MOV (básico). MIMEs sem checagem
   * específica (áudio) retornam true.
   */
  matchesMagicBytes(mimeType: string, buffer: Buffer): boolean {
    if (buffer.length < 4) return false;
    switch (mimeType) {
      case 'image/jpeg':
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      case 'image/png':
        return (
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47
        );
      case 'application/pdf':
        return buffer.subarray(0, 4).toString('latin1') === '%PDF';
      case 'image/webp':
        return (
          buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
          buffer.subarray(8, 12).toString('latin1') === 'WEBP'
        );
      case 'video/mp4':
      case 'video/quicktime':
        // MP4/MOV: 'ftyp' no offset 4.
        return buffer.length >= 8 && buffer.subarray(4, 8).toString('latin1') === 'ftyp';
      default:
        return true; // sem checagem específica (ex.: áudio)
    }
  }
}
