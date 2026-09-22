import * as request from 'supertest';
import { E2E_SUBJECTS, E2eTestContext } from './e2e-setup';

describe('Portal HTML (Phase 6)', () => {
  let ctx: E2eTestContext;

  beforeAll(async () => {
    ctx = await E2eTestContext.start();
  }, 120_000);

  afterAll(async () => {
    if (ctx) {
      await ctx.stop();
    }
  });

  it('GET / renders the home page', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/').expect(200);
    expect(res.text).toContain('University Library');
    expect(res.text).toContain('Search the catalog');
  });

  it('GET /account redirects to login when unauthenticated', async () => {
    await request(ctx.app.getHttpServer())
      .get('/account')
      .expect(302)
      .expect('Location', /\/login/);
  });

  it('rejects forged POST without CSRF token', async () => {
    await request(ctx.app.getHttpServer())
      .post('/login')
      .type('form')
      .send({
        sub: E2E_SUBJECTS.student,
        role: 'STUDENT',
        next: '/',
      })
      .expect(403);
  });

  it('logs in with CSRF + cookie and reaches /account', async () => {
    const agent = request.agent(ctx.app.getHttpServer());
    const loginPage = await agent.get('/login').expect(200);
    const csrf = csrfFrom(loginPage);

    await agent
      .post('/login')
      .type('form')
      .send({
        _csrf: csrf,
        sub: E2E_SUBJECTS.student,
        role: 'STUDENT',
        next: '/account',
      })
      .expect(303);

    const account = await agent.get('/account').expect(200);
    expect(account.text).toContain('E2E Student');
  });

  it('GET /search renders catalog HTML over UnifiedSearchService', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/search')
      .query({ q: 'E2E Test' })
      .expect(200);
    expect(res.text).toContain('Catalog search');
    expect(res.text).toContain('E2E Test Book');
  });
});

function csrfFrom(res: request.Response): string {
  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = cookies
    .map((c) => /csrf_token=([^;]+)/.exec(c))
    .find((m) => m !== null);
  if (!match) {
    throw new Error('csrf_token cookie missing');
  }
  return decodeURIComponent(match[1]);
}
