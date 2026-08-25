import { Injectable } from '@nestjs/common';
import { SaveParams, StorageProvider, StoredFile } from './storage.provider';

/** Storage simulado (sandbox/testes): não escreve em disco. */
@Injectable()
export class MockStorageProvider implements StorageProvider {
  private store = new Map<string, Buffer>();

  async save(params: SaveParams): Promise<StoredFile> {
    this.store.set(params.storedName, params.buffer);
    return {
      url: `mock://storage/${params.storedName}`,
      provider: 'mock',
      storedName: params.storedName,
    };
  }

  async read(storedName: string): Promise<Buffer> {
    return this.store.get(storedName) ?? Buffer.from(`mock:${storedName}`);
  }
}
