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
}));
