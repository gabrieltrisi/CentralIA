import { BadRequestException } from '@nestjs/common';
import { FileSecurityService } from './file-security.service';

describe('FileSecurityService', () => {
  const sec = new FileSecurityService();

  it('sanitizeFilename remove caminho e caracteres perigosos', () => {
    expect(sec.sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sec.sanitizeFilename('foto do rg!.jpg')).toBe('foto_do_rg_.jpg');
  });

  it('assertNotExecutable bloqueia executáveis', () => {
    expect(() => sec.assertNotExecutable('virus.exe')).toThrow(BadRequestException);
    expect(() => sec.assertNotExecutable('rg.jpg')).not.toThrow();
  });

  it('validate aceita mime/tamanho válidos e rejeita inválidos', () => {
    expect(() => sec.validate('image', 'image/jpeg', 1024)).not.toThrow();
    expect(() => sec.validate('image', 'application/x-msdownload', 1024)).toThrow(BadRequestException);
    expect(() => sec.validate('image', 'image/jpeg', 50 * 1024 * 1024)).toThrow(BadRequestException);
  });

  it('buildStoredName gera UUID + extensão pelo mime', () => {
    expect(sec.buildStoredName('application/pdf')).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(sec.buildStoredName('video/mp4')).toMatch(/\.mp4$/);
  });

  describe('magic bytes', () => {
    it('valida JPEG', () => {
      expect(sec.matchesMagicBytes('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
      expect(sec.matchesMagicBytes('image/jpeg', Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe(false);
    });
    it('valida PNG', () => {
      expect(sec.matchesMagicBytes('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(true);
      expect(sec.matchesMagicBytes('image/png', Buffer.from('not png'))).toBe(false);
    });
    it('valida PDF', () => {
      expect(sec.matchesMagicBytes('application/pdf', Buffer.from('%PDF-1.4'))).toBe(true);
      expect(sec.matchesMagicBytes('application/pdf', Buffer.from('XPDF'))).toBe(false);
    });
    it('valida MP4 (ftyp)', () => {
      const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom')]);
      expect(sec.matchesMagicBytes('video/mp4', mp4)).toBe(true);
      expect(sec.matchesMagicBytes('video/mp4', Buffer.from('xxxxyyyy'))).toBe(false);
    });
    it('rejeita buffer muito curto', () => {
      expect(sec.matchesMagicBytes('image/jpeg', Buffer.from([0xff]))).toBe(false);
    });
  });
});
