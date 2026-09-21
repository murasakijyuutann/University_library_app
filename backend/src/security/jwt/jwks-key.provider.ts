import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import jwksClient = require('jwks-rsa');
import { AppConfig } from '../../config/configuration';
import { PublicKeyProvider } from './public-key-provider';

/**
 * Prod binding: fetches the university IdP's rotating public keys from its
 * JWKS endpoint (`/.well-known/jwks.json`), cached with periodic refresh via
 * `jwks-rsa`. Selected when `JWT_PUBLIC_KEY_SOURCE=jwks`. Not exercised by a
 * live IdP in this project (see docs/data-provenance-and-ingestion_v2.md's
 * "designed, not built" pattern for external integrations) — unit-tested
 * against a fake JWKS instead (see jwks-key.provider.spec.ts).
 */
@Injectable()
export class JwksKeyProvider implements PublicKeyProvider {
  private readonly client: jwksClient.JwksClient;

  constructor(private readonly configService: ConfigService) {
    const jwksUri = this.configService.get<AppConfig>('app')?.jwt.jwksUri ?? '';
    this.client = jwksClient({ jwksUri, cache: true, rateLimit: true });
  }

  async resolveSigningKey(rawToken: string): Promise<string> {
    const decoded = jwt.decode(rawToken, { complete: true });
    const kid = decoded?.header.kid;
    if (!kid) {
      throw new UnauthorizedException('Token is missing the "kid" header required for JWKS lookup.');
    }
    const signingKey = await this.client.getSigningKey(kid);
    return signingKey.getPublicKey();
  }

  getAlgorithm(): 'RS256' {
    return 'RS256';
  }
}
