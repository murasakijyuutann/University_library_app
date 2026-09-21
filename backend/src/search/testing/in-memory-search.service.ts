import {
  FacetCount,
  FacetDimension,
  FacetFilter,
  ResourceSummaryDto,
  SearchQuery,
  SearchResults,
  UnifiedSearchService,
  clampPagination,
} from '../api';

export interface InMemorySearchDocument {
  readonly summary: ResourceSummaryDto;
  /** Plain searchable text (title + secondary fields) — not engine syntax. */
  readonly searchableText: string;
  readonly year: number | null;
  readonly language: string;
  readonly degreeType: string | null;
}

/**
 * Second UnifiedSearchService implementation (Phase 5.3) — permanent test
 * fixture proving the contract is swappable without fabricating ts_rank.
 */
export class InMemorySearchService implements UnifiedSearchService {
  constructor(private readonly documents: ReadonlyArray<InMemorySearchDocument>) {}

  async search(query: SearchQuery): Promise<SearchResults> {
    const page = clampPagination(query.page);
    const text = query.text.trim().toLowerCase();

    let matched = this.documents.filter((doc) => {
      if (text.length > 0 && !doc.searchableText.toLowerCase().includes(text)) {
        return false;
      }
      return query.filters.every((filter) => this.matchesFilter(doc, filter));
    });

    // Relevance ≈ simple preference: title-prefix / title-contains before others.
    if (text.length > 0) {
      matched = [...matched].sort((a, b) => {
        const score = (doc: InMemorySearchDocument) => {
          const title = doc.summary.title.toLowerCase();
          if (title.startsWith(text)) return 0;
          if (title.includes(text)) return 1;
          return 2;
        };
        return score(a) - score(b);
      });
    }

    const totalMatches = matched.length;
    const offset = (page.page - 1) * page.size;
    const pageDocs = matched.slice(offset, offset + page.size);
    const facets = this.computeFacets(text, query.filters);

    return {
      results: pageDocs.map((d) => d.summary),
      totalMatches,
      facets,
      page,
    };
  }

  private matchesFilter(doc: InMemorySearchDocument, filter: FacetFilter): boolean {
    switch (filter.dimension) {
      case FacetDimension.RESOURCE_TYPE:
        return doc.summary.type === filter.value;
      case FacetDimension.DEPARTMENT:
        return doc.summary.department === filter.value;
      case FacetDimension.YEAR:
        return doc.year !== null && String(doc.year) === filter.value;
      case FacetDimension.LANGUAGE:
        return doc.language === filter.value;
      case FacetDimension.DEGREE_TYPE:
        return doc.degreeType === filter.value;
      case FacetDimension.ACCESS_STATUS:
        return doc.summary.accessStatus === filter.value;
      default:
        return true;
    }
  }

  private computeFacets(
    text: string,
    filters: ReadonlyArray<FacetFilter>,
  ): FacetCount[] {
    const facets: FacetCount[] = [];

    for (const dimension of Object.values(FacetDimension)) {
      const filtersSans = filters.filter((f) => f.dimension !== dimension);
      const base = this.documents.filter((doc) => {
        if (text.length > 0 && !doc.searchableText.toLowerCase().includes(text)) {
          return false;
        }
        return filtersSans.every((filter) => this.matchesFilter(doc, filter));
      });

      const counts = new Map<string, number>();
      for (const doc of base) {
        const value = this.facetValue(doc, dimension);
        if (value === null) continue;
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }

      const sorted = [...counts.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      });

      for (const [value, count] of sorted) {
        facets.push({ dimension, value, count });
      }
    }

    return facets;
  }

  private facetValue(
    doc: InMemorySearchDocument,
    dimension: FacetDimension,
  ): string | null {
    switch (dimension) {
      case FacetDimension.RESOURCE_TYPE:
        return doc.summary.type;
      case FacetDimension.DEPARTMENT:
        return doc.summary.department;
      case FacetDimension.YEAR:
        return doc.year !== null ? String(doc.year) : null;
      case FacetDimension.LANGUAGE:
        return doc.language;
      case FacetDimension.DEGREE_TYPE:
        return doc.degreeType;
      case FacetDimension.ACCESS_STATUS:
        return doc.summary.accessStatus;
      default:
        return null;
    }
  }
}
