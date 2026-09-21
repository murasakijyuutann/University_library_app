import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { PublicKeyProvider } from './public-key-provider';

/**
 * Dev binding: reads the mock IdP's static signing secret. Selected when
 * `JWT_PUBLIC_KEY_SOURCE=static` (the default — see .env.example).
 */
@Injectable()
export class StaticKeyProvider implements PublicKeyProvider {
  constructor(private readonly configService: ConfigService) {}

  async resolveSigningKey(): Promise<string> {
    const secret = this.configService.get<AppConfig>('app')?.jwt.mockIdpSigningSecret;
    if (!secret) {
      throw new Error('MOCK_IDP_SIGNING_SECRET is not configured.');
    }
    return secret;
  }

  getAlgorithm(): 'HS256' {
    return 'HS256';
  }
}
