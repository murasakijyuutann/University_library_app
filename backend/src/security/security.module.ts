import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AppConfig } from '../config/configuration';
import { JwtAuthGuard } from './jwt/jwt-auth.guard';
import { JwtStrategy } from './jwt/jwt.strategy';
import { JwksKeyProvider } from './jwt/jwks-key.provider';
import { PUBLIC_KEY_PROVIDER } from './jwt/public-key-provider';
import { StaticKeyProvider } from './jwt/static-key.provider';
import { MockIdpController } from './mock-idp.controller';
import { RolesGuard } from './role/roles.guard';

/**
 * The SSO-relying-party boundary (project-structure_v3.md §2.2) — the app
 * never owns credentials, only consumes identity claims. `MockIdpController`
 * is registered only outside production, matching "registered only in the
 * development configuration, never in production."
 */
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: process.env.NODE_ENV === 'production' ? [] : [MockIdpController],
  providers: [
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    StaticKeyProvider,
    JwksKeyProvider,
    {
      provide: PUBLIC_KEY_PROVIDER,
      useFactory: (
        configService: ConfigService,
        staticProvider: StaticKeyProvider,
        jwksProvider: JwksKeyProvider,
      ) => {
        const source = configService.get<AppConfig>('app')?.jwt.publicKeySource;
        return source === 'jwks' ? jwksProvider : staticProvider;
      },
      inject: [ConfigService, StaticKeyProvider, JwksKeyProvider],
    },
  ],
  exports: [JwtAuthGuard, RolesGuard, PUBLIC_KEY_PROVIDER],
})
export class SecurityModule {}
