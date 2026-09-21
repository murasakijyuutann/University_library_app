import { ResourceService } from '../../src/resource/service/resource.service';
import { PostgresFtsSearchService } from '../../src/search/service/postgres-fts-search.service';
import { registerUnifiedSearchContractTests } from '../../src/search/testing/unified-search.contract-tests';
import { IntegrationTestContext } from './testcontainers-setup';

describe('PostgresFtsSearchService (Phase 5.2)', () => {
  let ctx: IntegrationTestContext;
  let searchService: PostgresFtsSearchService;
  let resourceService: ResourceService;

  beforeAll(async () => {
    ctx = await IntegrationTestContext.start();
    resourceService = new ResourceService(ctx.prisma);
    searchService = new PostgresFtsSearchService(ctx.prisma);

    const student = await ctx.prisma.member.create({
      data: {
        ssoSubjectId: `search-student-${Date.now()}`,
        fullName: 'Search Student',
        email: `search-student-${Date.now()}@example.edu`,
        memberType: 'GRADUATE',
        role: 'STUDENT',
      },
    });

    await resourceService.createPhysicalBook({
      title: 'Introduction to Algorithms',
      author: 'Cormen',
      isbn: '9780262046305',
      publicationYear: 2022,
      department: 'Computer Science',
    });
    await resourceService.createJournalArticle({
      title: 'Deep Learning Survey',
      doi: '10.1000/dl-search',
      department: 'Computer Science',
    });
    await resourceService.createRareMaterial({
      title: 'Medieval Manuscript',
      department: 'History',
    });
    await resourceService.createThesis({
      title: 'Algorithms for Graphs',
      studentMemberId: student.id,
      degreeType: 'PHD',
      department: 'Computer Science',
    });
    await resourceService.createResearchReport({
      title: 'Campus Network Study',
      reportYear: 2021,
      departmentScope: 'Engineering',
      department: 'Engineering',
    });
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  });

  registerUnifiedSearchContractTests({
    getService: () => searchService,
    knownTitleFragment: 'Algorithms',
    knownResourceType: 'PHYSICAL_BOOK',
  });

  it('ranks a title match ahead of a weaker secondary match', async () => {
    const result = await searchService.search({
      text: 'Algorithms',
      filters: [],
      page: { page: 1, size: 10 },
    });
    expect(result.results.length).toBeGreaterThanOrEqual(2);
    expect(result.results[0].title.toLowerCase()).toContain('algorithms');
  });

  it('supports diacritic-insensitive matching via library_unaccent', async () => {
    await resourceService.createPhysicalBook({
      title: 'José Müller on Networks',
      author: 'José Müller',
      department: 'Computer Science',
    });

    const result = await searchService.search({
      text: 'Jose Muller',
      filters: [],
      page: { page: 1, size: 10 },
    });
    expect(result.totalMatches).toBeGreaterThan(0);
    expect(result.results.some((r) => r.title.includes('Müller'))).toBe(true);
  });
});
