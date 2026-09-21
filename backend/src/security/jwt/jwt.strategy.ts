import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { JwtClaims } from './jwt-claims';
import { PUBLIC_KEY_PROVIDER, PublicKeyProvider } from './public-key-provider';

/**
 * Verifies an incoming SSO-issued JWT and attaches its claims to
 * `request.user` — the Nest equivalent of the old Spring `JwtAuthFilter`
 * populating the security context (project-structure_v3.md §2.2).
 *
 * The signing key is resolved per-request through `PublicKeyProvider`
 * (`secretOrKeyProvider`, passport-jwt's async key-resolution hook) — this
 * strategy never knows whether it's talking to the mock IdP's static secret
 * or a real IdP's JWKS endpoint; that is the whole point of the seam.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(PUBLIC_KEY_PROVIDER) publicKeyProvider: PublicKeyProvider) {
    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
