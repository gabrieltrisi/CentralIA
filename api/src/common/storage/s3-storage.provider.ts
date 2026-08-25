import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SaveParams, StorageProvider, StoredFile } from './storage.provider';

/**
 * Storage compatível com S3 (AWS/MinIO/etc). O cliente é injetável para testes.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  readonly client: S3Client;

  constructor(
    private readonly config: ConfigService,
    @Optional() client?: S3Client,
  ) {
    const s3 = this.config.get('storage.s3') as any;
    this.bucket = s3?.bucket ?? '';
    this.publicBaseUrl = s3?.publicBaseUrl ?? '';
    this.client =
      client ??
      new S3Client({
        region: s3?.region,
        endpoint: s3?.endpoint,
        forcePathStyle: !!s3?.endpoint,
        credentials:
          s3?.accessKeyId && s3?.secretAccessKey
            ? { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey }
            : undefined,
      });
  }

  async save(params: SaveParams): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.storedName,
        Body: params.buffer,
        ContentType: params.mimeType,
      }),
    );
    const url = this.publicBaseUrl
      ? `${this.publicBaseUrl.replace(/\/$/, '')}/${params.storedName}`
      : `s3://${this.bucket}/${params.storedName}`;
    return { url, provider: 's3', storedName: params.storedName };
  }

  async read(storedName: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storedName }),
    );
    const body = res.Body as any;
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
}
