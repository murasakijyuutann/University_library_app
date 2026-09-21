import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { JwksKeyProvider } from './jwks-key.provider';

// Phase 4.3 (build-guide.md): "the prod binding is present and unit-tested
// against a fake JWKS even if not live." Mocks `jwks-rsa` itself (no network
// call) — this test proves JwksKeyProvider correctly reads a token's `kid`
// header and asks the JWKS client for that exact key, not that a real IdP
// is reachable.
jest.mock('jwks-rsa', () =>
  jest.fn().mockImplementation(() => ({
    getSigningKey: jest.fn().mockImplementation((kid: string) =>
      Promise.resolve({
        getPublicKey: () => `FAKE_PUBLIC_KEY_FOR_${kid}`,
      }),
    ),
  })),
);

function fakeConfigService(jwksUri: string): ConfigService {
  const fake = { get: () => ({ jwt: { jwksUri } }) };
  return fake as unknown as ConfigService;
}

describe('JwksKeyProvider (Phase 4.3)', () => {
  it("resolves the signing key using the token's kid header", async () => {
    const provider = new JwksKeyProvider(
      fakeConfigService('https://idp.example.edu/.well-known/jwks.json'),
    );
    const token = jwt.sign({ sub: 'member-1' }, 'irrelevant-unverified-secret', {
      keyid: 'test-kid-1',
    });

    const key = await provider.resolveSigningKey(token);

    expect(key).toBe('FAKE_PUBLIC_KEY_FOR_test-kid-1');
  });

  it('rejects a token with no kid header', async () => {
    const provider = new JwksKeyProvider(
      fakeConfigService('https://idp.example.edu/.well-known/jwks.json'),
    );
    const token = jwt.sign({ sub: 'member-1' }, 'irrelevant-unverified-secret');

    await expect(provider.resolveSigningKey(token)).rejects.toThrow();
  });

  it('reports its algorithm as RS256', () => {
    const provider = new JwksKeyProvider(
      fakeConfigService('https://idp.example.edu/.well-known/jwks.json'),
    );
    expect(provider.getAlgorithm()).toBe('RS256');
  });
});
