import { FacetFilter } from './facet';
import { Pagination } from './pagination';

/**
 * Structured search input — plain terms only, never engine query syntax
 * (search-interface-contract.md §2 / §4.2).
 */
export interface SearchQuery {
  readonly text: string;
  readonly filters: ReadonlyArray<FacetFilter>;
  readonly page: Pagination;
}
