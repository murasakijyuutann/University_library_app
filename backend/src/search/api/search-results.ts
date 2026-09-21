import { FacetCount } from './facet';
import { Pagination } from './pagination';
import { ResourceSummaryDto } from './resource-summary.dto';

/**
 * Results + facet counts in one object (search-interface-contract.md §3 / §4.3).
 * Relevance is conveyed only by array order — no `score` / `ts_rank` field.
 */
export interface SearchResults {
  readonly results: ReadonlyArray<ResourceSummaryDto>;
  readonly totalMatches: number;
  readonly facets: ReadonlyArray<FacetCount>;
  readonly page: Pagination;
}
