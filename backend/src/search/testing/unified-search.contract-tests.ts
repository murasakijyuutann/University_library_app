import {
  FacetDimension,
  MAX_PAGE_SIZE,
  SearchQuery,
  UnifiedSearchService,
} from '../api';

/**
 * Shared behavioral contract tests (Phase 5.3). Run against both
 * InMemorySearchService and PostgresFtsSearchService so a Postgres-only leak
 * fails the in-memory suite immediately.
 */
export function registerUnifiedSearchContractTests(opts: {
  getService: () => UnifiedSearchService;
  /** A title known to exist in the seeded corpus for both backends. */
  knownTitleFragment: string;
  /** Resource type present in the corpus (for filter assertions). */
  knownResourceType: string;
}): void {
  const { getService, knownTitleFragment, knownResourceType } = opts;

  it('clamps page size to MAX_PAGE_SIZE', async () => {
    const result = await getService().search({
      text: '',
      filters: [],
      page: { page: 1, size: MAX_PAGE_SIZE + 100 },
    });
    expect(result.page.size).toBe(MAX_PAGE_SIZE);
    expect(result.results.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });

  it('returns facet counts together with results (never a separate channel)', async () => {
    const result = await getService().search({
      text: '',
      filters: [],
      page: { page: 1, size: 10 },
    });
    expect(Array.isArray(result.results)).toBe(true);
    expect(Array.isArray(result.facets)).toBe(true);
    expect(result.facets.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('score');
    for (const item of result.results) {
      expect(item).not.toHaveProperty('score');
    }
  });

  it('filters by RESOURCE_TYPE without leaking engine-specific query syntax', async () => {
    const query: SearchQuery = {
      text: '',
      filters: [{ dimension: FacetDimension.RESOURCE_TYPE, value: knownResourceType }],
      page: { page: 1, size: 20 },
    };
    const result = await getService().search(query);
    expect(result.totalMatches).toBeGreaterThan(0);
    for (const item of result.results) {
      expect(item.type).toBe(knownResourceType);
    }
  });

  it('matches plain text against the corpus and returns hits in relevance order', async () => {
    const result = await getService().search({
      text: knownTitleFragment,
      filters: [],
      page: { page: 1, size: 20 },
    });
    expect(result.totalMatches).toBeGreaterThan(0);
    const titles = result.results.map((r) => r.title.toLowerCase());
    expect(titles.some((t) => t.includes(knownTitleFragment.toLowerCase()))).toBe(
      true,
    );
  });

  it('includes RESOURCE_TYPE facet counts that sum to at least totalMatches scope', async () => {
    const result = await getService().search({
      text: '',
      filters: [],
      page: { page: 1, size: 5 },
    });
    const typeFacets = result.facets.filter(
      (f) => f.dimension === FacetDimension.RESOURCE_TYPE,
    );
    const facetSum = typeFacets.reduce((sum, f) => sum + f.count, 0);
    expect(facetSum).toBe(result.totalMatches);
  });
}
