import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  jwt: {
    publicKeySource: 'static' | 'jwks';
    mockIdpSigningSecret: string;
    jwksUri: string;
  };
  web: {
    /** HttpOnly cookie carrying the verified SSO JWT for HTML routes. */
    sessionCookieName: string;
    csrfCookieName: string;
    cookieSecure: boolean;
  };
}

// Typed config loader consumed by ConfigModule.forRoot({ load: [configuration] }).
// Nest's equivalent of Spring's typed @ConfigurationProperties — env vars are
// parsed and shaped once here rather than read ad hoc with process.env across
// the codebase.
export default registerAs('app', (): AppConfig => ({
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwt: {
    publicKeySource:
      process.env.JWT_PUBLIC_KEY_SOURCE === 'jwks' ? 'jwks' : 'static',
    mockIdpSigningSecret: process.env.MOCK_IDP_SIGNING_SECRET ?? '',
    jwksUri: process.env.JWKS_URI ?? '',
  },
  web: {
    sessionCookieName: process.env.WEB_SESSION_COOKIE ?? 'library_token',
    csrfCookieName: process.env.WEB_CSRF_COOKIE ?? 'csrf_token',
    cookieSecure: process.env.NODE_ENV === 'production',
  },
}));
