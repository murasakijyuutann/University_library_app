import * as request from 'supertest';
import { E2eTestContext } from './e2e-setup';

// Health is also covered in api.e2e-spec; this file keeps the original
// entry-point smoke check but against the Phase 4 Testcontainers harness
// so `npm run test:e2e` does not require a local Postgres.
describe('Health (e2e)', () => {
  let ctx: E2eTestContext;

  beforeAll(async () => {
    ctx = await E2eTestContext.start();
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  });

  it('/health (GET)', () => {
    return request(ctx.app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
      });
  });
});
