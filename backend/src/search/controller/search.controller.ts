import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  FacetDimension,
  FacetFilter,
  SearchQuery,
  SearchResults,
  UNIFIED_SEARCH_SERVICE,
  UnifiedSearchService,
} from '../api';
import { SearchRequestDto } from '../dto/search-request.dto';

/**
 * Public catalog search (Phase 5.4) — unauthenticated, throttled, page-capped.
 * Delegates only to UnifiedSearchService; never names the Postgres engine.
 */
@Controller('api/search')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class SearchController {
  constructor(
    @Inject(UNIFIED_SEARCH_SERVICE)
    private readonly searchService: UnifiedSearchService,
  ) {}

  @Get()
  async search(@Query() query: SearchRequestDto): Promise<SearchResults> {
    return this.searchService.search(this.toSearchQuery(query));
  }

  private toSearchQuery(dto: SearchRequestDto): SearchQuery {
    const filters: FacetFilter[] = [];
    if (dto.type) {
      filters.push({ dimension: FacetDimension.RESOURCE_TYPE, value: dto.type });
    }
    if (dto.department) {
      filters.push({ dimension: FacetDimension.DEPARTMENT, value: dto.department });
    }
    if (dto.year) {
      filters.push({ dimension: FacetDimension.YEAR, value: dto.year });
    }
    if (dto.language) {
      filters.push({ dimension: FacetDimension.LANGUAGE, value: dto.language });
    }
    if (dto.degreeType) {
      filters.push({ dimension: FacetDimension.DEGREE_TYPE, value: dto.degreeType });
    }
    if (dto.accessStatus) {
      filters.push({
        dimension: FacetDimension.ACCESS_STATUS,
        value: dto.accessStatus,
      });
    }

    return {
      text: dto.q ?? '',
      filters,
      page: {
        page: dto.page ?? 1,
        size: dto.size ?? 20,
      },
    };
  }
}
