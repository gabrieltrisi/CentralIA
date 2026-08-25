import { resolveStorageDriver } from './storage.module';

describe('resolveStorageDriver', () => {
  it('sandbox sem driver → mock', () => {
    expect(resolveStorageDriver(true, '', false)).toBe('mock');
  });

  it('produção sem driver → local exige permissão', () => {
    expect(() => resolveStorageDriver(false, '', false)).toThrow();
    expect(resolveStorageDriver(false, '', true)).toBe('local');
  });

  it('produção com s3 → s3', () => {
    expect(resolveStorageDriver(false, 's3', false)).toBe('s3');
  });

  it('driver inválido → erro', () => {
    expect(() => resolveStorageDriver(true, 'ftp', false)).toThrow();
  });
});
