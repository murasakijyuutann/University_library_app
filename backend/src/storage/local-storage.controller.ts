import {
  Controller,
  ForbiddenException,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { LocalObjectStorageService } from './local-object-storage.service';

/**
 * Receives PUT bodies only for the local storage driver (HMAC token on query).
 * Not registered when STORAGE_DRIVER=s3.
 */
@Controller('_local-storage')
export class LocalStorageController {
  constructor(private readonly localStorage: LocalObjectStorageService) {}

  @Put()
  async put(
    @Query('key') key: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Query('ct') contentType: string,
    @Req() req: Request,
  ): Promise<{ ok: true; key: string }> {
    if (!key || !exp || !sig || !contentType) {
      throw new ForbiddenException('Missing signed upload parameters.');
    }
    if (!this.localStorage.verify(key, exp, contentType, sig)) {
      throw new ForbiddenException('Invalid or expired upload URL.');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    await this.localStorage.putObject(key, Buffer.concat(chunks));
    return { ok: true, key };
  }
}
