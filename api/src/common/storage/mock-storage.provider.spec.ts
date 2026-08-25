import { MockStorageProvider } from './mock-storage.provider';

describe('MockStorageProvider', () => {
  it('retorna url mock sem escrever em disco', async () => {
    const provider = new MockStorageProvider();
    const r = await provider.save({
      buffer: Buffer.from('x'),
      storedName: 'abc.pdf',
      mimeType: 'application/pdf',
    });
    expect(r.provider).toBe('mock');
    expect(r.url).toBe('mock://storage/abc.pdf');
  });
});
