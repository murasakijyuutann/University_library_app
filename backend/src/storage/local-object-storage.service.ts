import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { AppConfig } from '../config/configuration';
import { ObjectStorage, PresignedUpload } from './object-storage.port';

/**
 * Dev/e2e stand-in for S3: issues HMAC-signed PUT URLs against
 * `/_local-storage/...`. Bytes hit Nest only in this driver — production
 * uses `S3ObjectStorageService` and never does.
 */
@Injectable()
export class LocalObjectStorageService implements ObjectStorage {
  constructor(private readonly configService: ConfigService) {}

  async createUploadUrl(input: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload> {
    const expiresInSeconds = input.expiresInSeconds ?? 900;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000).toString();
    const sig = this.sign(input.key, exp, input.contentType);
    const uploadUrl = `/_local-storage?key=${encodeURIComponent(input.key)}&exp=${exp}&sig=${sig}&ct=${encodeURIComponent(input.contentType)}`;

    return {
      key: input.key,
      uploadUrl,
      headers: { 'Content-Type': input.contentType },
      expiresAt,
    };
  }

  verify(key: string, exp: string, contentType: string, sig: string): boolean {
    if (Number.parseInt(exp, 10) * 1000 < Date.now()) {
      return false;
    }
    const expected = this.sign(key, exp, contentType);
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
      return false;
    }
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    const root = this.storageRoot();
    const absolute = join(root, key);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, body);
  }

  private sign(key: string, exp: string, contentType: string): string {
    const secret = this.signingSecret();
    return createHmac('sha256', secret)
      .update(`${key}\n${exp}\n${contentType}`)
      .digest('hex');
  }

  private signingSecret(): string {
    const app = this.configService.get<AppConfig>('app');
    return (
      app?.storage.localSigningSecret ||
      app?.jwt.mockIdpSigningSecret ||
      'dev-local-storage-secret'
    );
  }

  private storageRoot(): string {
    const app = this.configService.get<AppConfig>('app');
    return app?.storage.localRoot ?? join(process.cwd(), '.local-storage');
  }
}
