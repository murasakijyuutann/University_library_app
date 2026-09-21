import * as request from 'supertest';
import { MAX_PAGE_SIZE } from '../src/search/api';
import { ResourceService } from '../src/resource/service/resource.service';
import { E2eTestContext } from './e2e-setup';

describe('Search route (Phase 5.4)', () => {
  let ctx: E2eTestContext;

  beforeAll(async () => {
    ctx = await E2eTestContext.start();
    const resources = new ResourceService(ctx.prisma);
    await resources.createPhysicalBook({
      title: 'Phase Five Search Book',
      author: 'Search Author',
      department: 'Computer Science',
      publicationYear: 2024,
    });
    await resources.createJournalArticle({
      title: 'Phase Five Journal',
      doi: '10.1000/phase5',
    });
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  });

  it('GET /api/search is public and returns faceted results', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/search')
      .query({ q: 'Phase Five', page: 1, size: 10 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.totalMatches).toBeGreaterThan(0);
        expect(Array.isArray(body.results)).toBe(true);
        expect(Array.isArray(body.facets)).toBe(true);
        expect(body.page.size).toBe(10);
        expect(body.results[0]).not.toHaveProperty('score');
      });
  });

  it('clamps oversized page size', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/search')
      .query({ size: MAX_PAGE_SIZE + 50 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.page.size).toBe(MAX_PAGE_SIZE);
      });
  });

  it('filters by resource type query param', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/search')
      .query({ type: 'PHYSICAL_BOOK', q: 'Phase Five' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.totalMatches).toBeGreaterThan(0);
        for (const item of body.results) {
          expect(item.type).toBe('PHYSICAL_BOOK');
        }
      });
  });
});
