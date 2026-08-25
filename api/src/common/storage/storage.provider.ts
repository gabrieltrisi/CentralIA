export interface StoredFile {
  url: string;
  provider: string;
  storedName: string;
}

export interface SaveParams {
  buffer: Buffer;
  storedName: string; // nome final já sanitizado (UUID + ext)
  mimeType: string;
}

/** Abstração de armazenamento de anexos. */
export interface StorageProvider {
  save(params: SaveParams): Promise<StoredFile>;
  /** Lê o binário pelo nome físico (storedName). */
  read(storedName: string): Promise<Buffer>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
