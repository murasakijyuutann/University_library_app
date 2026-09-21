import { Role } from '@prisma/client';
import * as request from 'supertest';
import { E2E_SUBJECTS, E2eTestContext } from './e2e-setup';

// Phase 4.2 / 4.3 (build-guide.md) — the JWT relying-party boundary:
// mock IdP issues tokens, guards validate them, role-gated routes reject
// the wrong role, and unprovisioned identities are a distinct failure mode.
describe('Auth boundary (Phase 4.2 / 4.3)', () => {
  let ctx: E2eTestContext;

  beforeAll(async () => {
    ctx = await E2eTestContext.start();
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  });

  it('mock IdP issues a token that the guard accepts end-to-end', async () => {
    const token = await ctx.issueToken(E2E_SUBJECTS.student, Role.STUDENT);

    await request(ctx.app.getHttpServer())
      .get('/api/members/me')
      .set(ctx.authHeader(token))
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe(ctx.seed.student.id.toString());
        expect(body.fullName).toBe('E2E Student');
        expect(body.role).toBe('STUDENT');
      });
  });

  it('rejects a request without a token', async () => {
    await request(ctx.app.getHttpServer()).get('/api/members/me').expect(401);
  });

  it('rejects an invalid token', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/members/me')
      .set({ Authorization: 'Bearer not-a-real-token' })
      .expect(401);
  });

  it('rejects a valid token for an unprovisioned identity', async () => {
    const token = await ctx.issueToken(E2E_SUBJECTS.unprovisioned, Role.STUDENT);

    await request(ctx.app.getHttpServer())
      .get('/api/members/me')
      .set(ctx.authHeader(token))
      .expect(401)
      .expect(({ body }) => {
        expect(body.message).toContain(E2E_SUBJECTS.unprovisioned);
      });
  });

  it('rejects a student token on a librarian-only cataloguing route', async () => {
    const token = await ctx.issueToken(E2E_SUBJECTS.student, Role.STUDENT);

    await request(ctx.app.getHttpServer())
      .post('/api/resources/physical-books')
      .set(ctx.authHeader(token))
      .send({ title: 'Student Cataloguing Attempt' })
      .expect(403);
  });

  it('allows a librarian token on a librarian-only cataloguing route', async () => {
    const token = await ctx.issueToken(E2E_SUBJECTS.librarian, Role.LIBRARIAN);

    await request(ctx.app.getHttpServer())
      .post('/api/resources/physical-books')
      .set(ctx.authHeader(token))
      .send({ title: 'Librarian Catalogued Book' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.resourceType).toBe('PHYSICAL_BOOK');
        expect(body.title).toBe('Librarian Catalogued Book');
      });
  });

  it('rejects a student token on an ILL staff transition route', async () => {
    const studentToken = await ctx.issueToken(E2E_SUBJECTS.student, Role.STUDENT);
    const submitResponse = await request(ctx.app.getHttpServer())
      .post('/api/ill-requests')
      .set(ctx.authHeader(studentToken))
      .send({ title: 'ILL Auth Test' })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/ill-requests/${submitResponse.body.id}/transition`)
      .set(ctx.authHeader(studentToken))
      .send({ to: 'UNDER_REVIEW' })
      .expect(403);
  });
});
