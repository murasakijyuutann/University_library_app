import { SearchQuery } from './search-query';
import { SearchResults } from './search-results';

/**
 * Swappable retrieval port (search-interface-contract.md §1).
 * Consumers inject this token; they never name PostgresFtsSearchService.
 */
export interface UnifiedSearchService {
  search(query: SearchQuery): Promise<SearchResults>;
}

export const UNIFIED_SEARCH_SERVICE = Symbol('UNIFIED_SEARCH_SERVICE');
