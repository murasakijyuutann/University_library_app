import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ResourceService } from '../../src/resource/service/resource.service';
import { IntegrationTestContext } from './testcontainers-setup';

// Phase 1 (build-guide.md) — proving the single biggest bet the stack makes:
// that the hand-modeled Prisma hierarchy (base `resource` + subtype row,
// written atomically in a service-layer transaction) actually holds up against
// real Postgres, and that the TypeScript discriminated union gives real
// compiler-enforced exhaustiveness on the read side.
describe('ResourceService — hierarchy invariant (Phase 1)', () => {
  let ctx: IntegrationTestContext;
  let resourceService: ResourceService;

  beforeAll(async () => {
    ctx = await IntegrationTestContext.start();
    resourceService = new ResourceService(ctx.prisma);
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  });

  it('1.1/1.3 — creating a PhysicalBook persists both the base resource row and the subtype row, sharing one id', async () => {
    const created = await resourceService.createPhysicalBook({
      title: 'Introduction to Algorithms',
      isbn: '9780262046305',
      author: 'Cormen, Leiserson, Rivest, Stein',
    });

    expect(created.resourceType).toBe('PHYSICAL_BOOK');
    expect(created.detail.isbn).toBe('9780262046305');

    const resourceRow = await ctx.prisma.resource.findUnique({
      where: { id: created.id },
    });
    const bookRow = await ctx.prisma.physicalBook.findUnique({
      where: { id: created.id },
    });

    expect(resourceRow).not.toBeNull();
    expect(bookRow).not.toBeNull();
    expect(resourceRow?.id).toBe(bookRow?.id);
  });

  it('1.3 — a failure mid-transaction rolls back the base row too, leaving neither half', async () => {
    const resourceCountBefore = await ctx.prisma.resource.count();

    // studentMemberId references a Member that does not exist -> FK violation
    // on the subtype write, forced deliberately to prove atomicity.
    await expect(
      resourceService.createThesis({
        title: 'A Thesis With No Valid Student',
        studentMemberId: BigInt(999_999_999),
      }),
    ).rejects.toBeInstanceOf(PrismaClientKnownRequestError);

    const resourceCountAfter = await ctx.prisma.resource.count();
    expect(resourceCountAfter).toBe(resourceCountBefore);
  });

  it('1.4 — findById narrows every subtype through the discriminated union, exhaustively', async () => {
    const student = await ctx.prisma.member.create({
      data: {
        ssoSubjectId: `student-${Date.now()}`,
        fullName: 'Test Student',
        email: 'student@example.edu',
        memberType: 'GRADUATE',
        role: 'STUDENT',
      },
    });

    const book = await resourceService.createPhysicalBook({ title: 'A Book' });
    const thesis = await resourceService.createThesis({
      title: 'A Thesis',
      studentMemberId: student.id,
      degreeType: 'PHD',
    });
    const article = await resourceService.createJournalArticle({
      title: 'An Article',
      doi: '10.1000/example-doi',
    });
    const report = await resourceService.createResearchReport({
      title: 'A Report',
      reportYear: 2024,
    });
    const rare = await resourceService.createRareMaterial({
      title: 'A Rare Manuscript',
      handlingNotes: 'White gloves required.',
    });

    const readBook = await resourceService.findById(book.id);
    const readThesis = await resourceService.findById(thesis.id);
    const readArticle = await resourceService.findById(article.id);
    const readReport = await resourceService.findById(report.id);
    const readRare = await resourceService.findById(rare.id);

    expect(readBook?.resourceType).toBe('PHYSICAL_BOOK');
    expect(readThesis?.resourceType).toBe('THESIS');
    expect(readArticle?.resourceType).toBe('JOURNAL_ARTICLE');
    expect(readReport?.resourceType).toBe('RESEARCH_REPORT');
    expect(readRare?.resourceType).toBe('RARE_MATERIAL');

    // Compile-time narrowing check: TypeScript only allows `.detail.doi` once
    // `readArticle.resourceType === 'JOURNAL_ARTICLE'` has narrowed the union —
    // this line would not compile against the wrong branch.
    if (readArticle?.resourceType === 'JOURNAL_ARTICLE') {
      expect(readArticle.detail.doi).toBe('10.1000/example-doi');
    } else {
      throw new Error('expected a JournalArticleResource');
    }

    if (readThesis?.resourceType === 'THESIS') {
      expect(readThesis.detail.degreeType).toBe('PHD');
    } else {
      throw new Error('expected a ThesisResource');
    }
  });

  it('findById returns null for a non-existent id', async () => {
    const result = await resourceService.findById(BigInt(999_999_998));
    expect(result).toBeNull();
  });
});
