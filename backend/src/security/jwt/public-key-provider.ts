export const PUBLIC_KEY_PROVIDER = Symbol('PUBLIC_KEY_PROVIDER');

/**
 * The mock-to-real-IdP swap seam, made concrete (project-structure_v3.md §2.2;
 * build-guide.md Phase 4.3). `JwtStrategy` resolves its verification key
 * through this interface alone — a dev binding (StaticKeyProvider, reading the
 * mock IdP's static secret) and a prod binding (JwksKeyProvider, fetching the
 * university IdP's rotating public keys from its JWKS endpoint) are the only
 * two things that ever change; the strategy, the guards, and everything
 * downstream stay identical either way.
 */
export interface PublicKeyProvider {
  /**
   * Resolves the key (or secret) `jsonwebtoken`/passport-jwt should verify
   * `rawToken`'s signature with. Takes the raw token because a JWKS provider
   * needs the token's `kid` header to pick the right rotating key; a static
   * provider ignores the argument entirely.
   */
  resolveSigningKey(rawToken: string): Promise<string>;

  /** The algorithm this provider's key is valid for (HS256 static / RS256 JWKS). */
  getAlgorithm(): 'HS256' | 'RS256';
}
