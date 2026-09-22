import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfig } from '../config/configuration';
import { ObjectStorage, PresignedUpload } from './object-storage.port';

@Injectable()
export class S3ObjectStorageService implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const storage = this.configService.get<AppConfig>('app')?.storage;
    if (!storage?.s3Bucket || !storage.s3Region) {
      throw new Error(
        'STORAGE_DRIVER=s3 requires STORAGE_S3_BUCKET and STORAGE_S3_REGION.',
      );
    }
    this.bucket = storage.s3Bucket;
    this.client = new S3Client({ region: storage.s3Region });
  }

  async createUploadUrl(input: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload> {
    const expiresInSeconds = input.expiresInSeconds ?? 900;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
    return {
      key: input.key,
      uploadUrl,
      headers: { 'Content-Type': input.contentType },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }
}
