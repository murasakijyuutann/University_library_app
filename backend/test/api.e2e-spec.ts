import { Role } from '@prisma/client';
import * as request from 'supertest';
import { ResourceService } from '../src/resource/service/resource.service';
import { E2E_SUBJECTS, E2eTestContext } from './e2e-setup';

// Phase 4.1 (build-guide.md) — Supertest hits each API route against a
// Testcontainers-backed app and verifies correct responses through the full
// controller → guard → service stack.
describe('API routes (Phase 4.1)', () => {
  let ctx: E2eTestContext;
  let studentToken: string;
  let librarianToken: string;
  let facultyToken: string;
  let journalArticleId: string;

  beforeAll(async () => {
    ctx = await E2eTestContext.start();
    studentToken = await ctx.issueToken(E2E_SUBJECTS.student, Role.STUDENT, {
      faculty: 'Computer Science',
    });
    librarianToken = await ctx.issueToken(E2E_SUBJECTS.librarian, Role.LIBRARIAN);
    facultyToken = await ctx.issueToken(E2E_SUBJECTS.faculty, Role.FACULTY);

    const resourceService = new ResourceService(ctx.prisma);
    const article = await resourceService.createJournalArticle({
      title: 'E2E Journal Article',
      doi: '10.1000/e2e-article',
    });
    journalArticleId = article.id.toString();
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  });

  describe('GET /health', () => {
    it('returns ok without auth', async () => {
      await request(ctx.app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect(({ body }) => {
          expect(body.status).toBe('ok');
        });
    });
  });

  describe('Resources', () => {
    it('GET /api/resources/:id returns a resource', async () => {
      await request(ctx.app.getHttpServer())
        .get(`/api/resources/${ctx.seed.bookId}`)
        .set(ctx.authHeader(studentToken))
        .expect(200)
        .expect(({ body }) => {
          expect(body.id).toBe(ctx.seed.bookId);
          expect(body.resourceType).toBe('PHYSICAL_BOOK');
          expect(body.title).toBe('E2E Test Book');
        });
    });

    it('GET /api/resources/:id/access returns an access decision', async () => {
      await request(ctx.app.getHttpServer())
        .get(`/api/resources/${ctx.seed.bookId}/access`)
        .set(ctx.authHeader(studentToken))
        .expect(200)
        .expect(({ body }) => {
          expect(body.allowed).toBe(true);
          expect(body.status).toBe('AVAILABLE');
        });
    });

    it('POST /api/resources/physical-books catalogues a book (librarian)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/resources/physical-books')
        .set(ctx.authHeader(librarianToken))
        .send({ title: 'API Route Test Book', isbn: '9780000000099' })
        .expect(201)
        .expect(({ body }) => {
          expect(body.resourceType).toBe('PHYSICAL_BOOK');
          expect(body.detail.isbn).toBe('9780000000099');
        });
    });

    it('POST /api/resources/theses catalogues a thesis (librarian)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/resources/theses')
        .set(ctx.authHeader(librarianToken))
        .send({
          title: 'API Route Test Thesis',
          studentMemberId: ctx.seed.student.id.toString(),
          degreeType: 'PHD',
        })
        .expect(201)
        .expect(({ body }) => {
          expect(body.resourceType).toBe('THESIS');
          expect(body.detail.studentMemberId).toBe(ctx.seed.student.id.toString());
        });
    });

    it('POST /api/resources/journal-articles catalogues an article (librarian)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/resources/journal-articles')
        .set(ctx.authHeader(librarianToken))
        .send({ title: 'API Route Test Article', doi: '10.1000/api-route' })
        .expect(201)
        .expect(({ body }) => {
          expect(body.resourceType).toBe('JOURNAL_ARTICLE');
          expect(body.detail.doi).toBe('10.1000/api-route');
        });
    });

    it('POST /api/resources/research-reports catalogues a report (librarian)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/resources/research-reports')
        .set(ctx.authHeader(librarianToken))
        .send({ title: 'API Route Test Report', reportYear: 2024 })
        .expect(201)
        .expect(({ body }) => {
          expect(body.resourceType).toBe('RESEARCH_REPORT');
          expect(body.detail.reportYear).toBe(2024);
        });
    });

    it('POST /api/resources/rare-materials catalogues rare material (librarian)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/resources/rare-materials')
        .set(ctx.authHeader(librarianToken))
        .send({
          title: 'API Route Test Manuscript',
          handlingNotes: 'White gloves required.',
        })
        .expect(201)
        .expect(({ body }) => {
          expect(body.resourceType).toBe('RARE_MATERIAL');
          expect(body.detail.handlingNotes).toBe('White gloves required.');
        });
    });
  });

  describe('Loans', () => {
    let loanId: string;

    it('POST /api/loans borrows a copy', async () => {
      const response = await request(ctx.app.getHttpServer())
        .post('/api/loans')
        .set(ctx.authHeader(studentToken))
        .send({ bookId: ctx.seed.bookId })
        .expect(201);

      expect(response.body.memberId).toBe(ctx.seed.student.id.toString());
      expect(response.body.status).toBe('ACTIVE');
      loanId = response.body.id;
    });

    it('POST /api/loans/:id/return returns the loan', async () => {
      await request(ctx.app.getHttpServer())
        .post(`/api/loans/${loanId}/return`)
        .set(ctx.authHeader(studentToken))
        .expect(201)
        .expect(({ body }) => {
          expect(body.id).toBe(loanId);
          expect(body.status).toBe('RETURNED');
          expect(body.returnedAt).not.toBeNull();
        });
    });
  });

  describe('Reservations', () => {
    let reservationId: string;

    it('POST /api/reservations enqueues a hold', async () => {
      const response = await request(ctx.app.getHttpServer())
        .post('/api/reservations')
        .set(ctx.authHeader(studentToken))
        .send({ resourceId: ctx.seed.bookId })
        .expect(201);

      expect(response.body.resourceId).toBe(ctx.seed.bookId);
      expect(response.body.status).toBe('QUEUED');
      expect(response.body.queuePosition).toBe(1);
      reservationId = response.body.id;
    });

    it('POST /api/reservations/:id/cancel cancels the hold', async () => {
      await request(ctx.app.getHttpServer())
        .post(`/api/reservations/${reservationId}/cancel`)
        .set(ctx.authHeader(studentToken))
        .expect(201)
        .expect(({ body }) => {
          expect(body.id).toBe(reservationId);
          expect(body.status).toBe('CANCELLED');
        });
    });

    it('POST /api/reservations rejects a rare material via AccessPolicyResolver', async () => {
      const rare = await new ResourceService(ctx.prisma).createRareMaterial({
        title: 'Supervised-Only Manuscript',
        handlingNotes: 'Reading room only.',
      });

      await request(ctx.app.getHttpServer())
        .post('/api/reservations')
        .set(ctx.authHeader(studentToken))
        .send({ resourceId: rare.id.toString() })
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toMatch(/supervised/i);
        });
    });
  });

  describe('Thesis submissions', () => {
    let submissionId: string;

    it('POST /api/thesis-submissions creates a draft (student)', async () => {
      const response = await request(ctx.app.getHttpServer())
        .post('/api/thesis-submissions')
        .set(ctx.authHeader(studentToken))
        .send({ degreeType: 'PHD' })
        .expect(201);

      expect(response.body.studentMemberId).toBe(ctx.seed.student.id.toString());
      expect(response.body.submissionStatus).toBe('DRAFT');
      submissionId = response.body.id;
    });

    it('POST /api/thesis-submissions/:id/transition submits the draft (student)', async () => {
      await ctx.prisma.thesisSubmission.update({
        where: { id: BigInt(submissionId) },
        data: { filePath: `theses/${submissionId}/api-e2e.pdf` },
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/thesis-submissions/${submissionId}/transition`)
        .set(ctx.authHeader(studentToken))
        .send({ to: 'SUBMITTED' })
        .expect(201)
        .expect(({ body }) => {
          expect(body.submissionStatus).toBe('SUBMITTED');
        });
    });

    it('POST /api/thesis-submissions/:id/transition advances review (faculty)', async () => {
      await request(ctx.app.getHttpServer())
        .post(`/api/thesis-submissions/${submissionId}/transition`)
        .set(ctx.authHeader(facultyToken))
        .send({ to: 'UNDER_REVIEW' })
        .expect(201)
        .expect(({ body }) => {
          expect(body.submissionStatus).toBe('UNDER_REVIEW');
        });
    });
  });

  describe('Journal access', () => {
    it('GET /api/journals/:id/resolve returns an access decision', async () => {
      await request(ctx.app.getHttpServer())
        .get(`/api/journals/${journalArticleId}/resolve`)
        .set(ctx.authHeader(studentToken))
        .expect(200)
        .expect(({ body }) => {
          expect(body.allowed).toBe(false);
          expect(body.status).toBe('LICENSE_GATED');
        });
    });

    it('GET /api/journals/:id/resolve rejects a non-article resource', async () => {
      await request(ctx.app.getHttpServer())
        .get(`/api/journals/${ctx.seed.bookId}/resolve`)
        .set(ctx.authHeader(studentToken))
        .expect(400);
    });
  });

  describe('ILL requests', () => {
    let illRequestId: string;

    it('POST /api/ill-requests submits a request (any member)', async () => {
      const response = await request(ctx.app.getHttpServer())
        .post('/api/ill-requests')
        .set(ctx.authHeader(studentToken))
        .send({
          title: 'ILL API Route Test',
          author: 'Remote Author',
          justification: 'Needed for research.',
        })
        .expect(201);

      expect(response.body.memberId).toBe(ctx.seed.student.id.toString());
      expect(response.body.status).toBe('SUBMITTED');
      illRequestId = response.body.id;
    });

    it('POST /api/ill-requests/:id/transition advances review (librarian)', async () => {
      await request(ctx.app.getHttpServer())
        .post(`/api/ill-requests/${illRequestId}/transition`)
        .set(ctx.authHeader(librarianToken))
        .send({ to: 'UNDER_REVIEW' })
        .expect(201)
        .expect(({ body }) => {
          expect(body.status).toBe('UNDER_REVIEW');
        });
    });
  });

  describe('Members', () => {
    it('GET /api/members/me returns the authenticated member profile', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/members/me')
        .set(ctx.authHeader(studentToken))
        .expect(200)
        .expect(({ body }) => {
          expect(body.id).toBe(ctx.seed.student.id.toString());
          expect(body.email).toBe('e2e-student@example.edu');
        });
    });
  });
});
