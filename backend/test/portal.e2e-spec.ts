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

  it('thesis draft → presigned local upload → confirm → submit', async () => {
    const agent = await loginAsStudent(ctx);

    const create = await agent
      .post('/thesis-submissions')
      .type('form')
      .send({
        _csrf: await freshCsrf(agent),
        degreeType: 'MASTER',
      })
      .expect(303);

    const location = String(create.headers.location);
    expect(location).toMatch(/\/thesis-submissions\/\d+/);
    const submissionId = location.split('/').pop()!;

    const detail = await agent.get(location).expect(200);
    expect(detail.text).toContain('data-thesis-upload');
    expect(detail.text).toContain('DRAFT');

    const uploadIntent = await agent
      .post(`/thesis-submissions/${submissionId}/upload-url`)
      .query({ contentType: 'application/pdf' })
      .set('X-CSRF-Token', await freshCsrf(agent))
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    // Nest default for @Post without @HttpCode is 201
    const { uploadUrl, key, headers } = uploadIntent.body as {
      uploadUrl: string;
      key: string;
      headers: Record<string, string>;
    };
    expect(key).toContain(`theses/${submissionId}/`);
    expect(uploadUrl).toContain('/_local-storage');

    const pdf = Buffer.from('%PDF-1.4 e2e thesis');
    await agent
      .put(uploadUrl)
      .set(headers)
      .send(pdf)
      .expect(200);

    await agent
      .post(`/thesis-submissions/${submissionId}/confirm-upload`)
      .type('form')
      .send({
        _csrf: await freshCsrf(agent),
        key,
      })
      .expect(303);

    const afterUpload = await agent
      .get(`/thesis-submissions/${submissionId}`)
      .expect(200);
    expect(afterUpload.text).toContain(key);
    expect(afterUpload.text).toContain('Submit for review');

    await agent
      .post(`/thesis-submissions/${submissionId}/submit`)
      .type('form')
      .send({ _csrf: await freshCsrf(agent) })
      .expect(303);

    const submitted = await agent
      .get(`/thesis-submissions/${submissionId}`)
      .expect(200);
    expect(submitted.text).toContain('SUBMITTED');
    expect(submitted.text).not.toContain('data-thesis-upload');
  });

  it('reservation hold-status partial reports queue position', async () => {
    const agent = await loginAsStudent(ctx);
    const bookId = ctx.seed.bookId;

    await agent
      .post(`/resources/${bookId}/reserve`)
      .type('form')
      .send({ _csrf: await freshCsrf(agent) })
      .expect(303);

    const hold = await agent
      .get(`/resources/${bookId}/hold-status`)
      .expect(200);
    expect(hold.text).toContain('Queue position');
    expect(hold.text).toMatch(/QUEUED|READY_FOR_PICKUP/);
  });

  it('stale borrow version returns 409 conflict HTML with refresh link', async () => {
    const agent = await loginAsStudent(ctx);
    const bookId = ctx.seed.bookId;
    const copy = await ctx.prisma.resourceCopy.findFirst({
      where: { bookId: BigInt(bookId) },
    });
    expect(copy).toBeTruthy();

    const res = await agent
      .post(`/resources/${bookId}/borrow`)
      .type('form')
      .send({
        _csrf: await freshCsrf(agent),
        copyId: copy!.id.toString(),
        copyVersion: '999999',
      })
      .expect(409);

    expect(res.text).toContain('Conflict');
    expect(res.text).toContain(`/resources/${bookId}`);
    expect(res.text).toContain('Refresh and continue');
  });
});

async function loginAsStudent(ctx: E2eTestContext) {
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
  return agent;
}

async function freshCsrf(
  agent: ReturnType<typeof request.agent>,
): Promise<string> {
  const page = await agent.get('/login').expect(200);
  return csrfFrom(page);
}

function csrfFrom(res: request.Response): string {
  const fromBody = /name="_csrf"\s+value="([^"]+)"/.exec(res.text);
  if (fromBody) {
    return fromBody[1];
  }

  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = cookies
    .map((c) => /csrf_token=([^;]+)/.exec(c))
    .find((m) => m !== null);
  if (!match) {
    throw new Error('csrf_token missing from login page');
  }
  return decodeURIComponent(match[1]);
}
