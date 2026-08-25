import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { SaveParams, StorageProvider, StoredFile } from './storage.provider';

/** Armazena os anexos no disco local (modo não-sandbox). */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly config: ConfigService) {}

  async save(params: SaveParams): Promise<StoredFile> {
    const dir = this.dir();
    await fs.mkdir(dir, { recursive: true });
    const path = join(dir, params.storedName);
    await fs.writeFile(path, params.buffer);
    return { url: `file://${path}`, provider: 'local', storedName: params.storedName };
  }

  async read(storedName: string): Promise<Buffer> {
    // Defesa contra path traversal: usa apenas o basename.
    const safe = storedName.replace(/^.*[\\/]/, '');
    return fs.readFile(join(this.dir(), safe));
  }

  private dir(): string {
    return resolve(this.config.get<string>('storage.dir') ?? './storage');
  }
}
