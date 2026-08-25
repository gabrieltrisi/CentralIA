import { ConfigService } from '@nestjs/config';
import { S3StorageProvider } from './s3-storage.provider';

function configStub() {
  return {
    get: (k: string) =>
      k === 'storage.s3'
        ? { bucket: 'centralia', region: 'us-east-1', publicBaseUrl: 'https://cdn.example.com' }
        : undefined,
  } as unknown as ConfigService;
}

describe('S3StorageProvider (cliente mockado)', () => {
  it('save envia PutObject e retorna URL pública', async () => {
    const send = jest.fn().mockResolvedValue({});
    const provider = new S3StorageProvider(configStub(), { send } as any);

    const r = await provider.save({ buffer: Buffer.from('x'), storedName: 'abc.pdf', mimeType: 'application/pdf' });
    expect(send).toHaveBeenCalled();
    expect(r.provider).toBe('s3');
    expect(r.url).toBe('https://cdn.example.com/abc.pdf');
  });

  it('read recupera o objeto via GetObject', async () => {
    async function* gen() {
      yield Buffer.from('hello');
    }
    const send = jest.fn().mockResolvedValue({ Body: gen() });
    const provider = new S3StorageProvider(configStub(), { send } as any);

    const buf = await provider.read('abc.pdf');
    expect(buf.toString()).toBe('hello');
  });
});
