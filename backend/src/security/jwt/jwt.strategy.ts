import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { AppConfig } from '../../config/configuration';
import { JwtClaims } from './jwt-claims';
import { PUBLIC_KEY_PROVIDER, PublicKeyProvider } from './public-key-provider';

/**
 * Verifies an incoming SSO-issued JWT and attaches its claims to
 * `request.user` — the Nest equivalent of the old Spring `JwtAuthFilter`
 * populating the security context (project-structure_v3.md §2.2).
 *
 * Accepts Bearer tokens (JSON API) or the portal HttpOnly session cookie
 * (Phase 6 HTML). The signing key is resolved per-request through
 * `PublicKeyProvider` — this strategy never knows mock vs JWKS.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(PUBLIC_KEY_PROVIDER) publicKeyProvider: PublicKeyProvider,
    configService: ConfigService,
  ) {
    const cookieName =
      configService.get<AppConfig>('app')?.web.sessionCookieName ?? 'library_token';

    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => {
          const cookies = request.cookies as Record<string, string> | undefined;
          return cookies?.[cookieName] ?? null;
        },
      ]),
      algorithms: ['HS256', 'RS256'],
      secretOrKeyProvider: (_request, rawJwtToken: string, done) => {
        publicKeyProvider
          .resolveSigningKey(rawJwtToken)
          .then((key) => done(null, key))
          .catch((error: unknown) =>
            done(error instanceof Error ? error : new Error(String(error))),
          );
      },
    };
    super(options);
  }

  validate(payload: JwtClaims): JwtClaims {
    return payload;
  }
}
