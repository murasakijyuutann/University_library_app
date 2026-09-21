import { Module } from '@nestjs/common';
import { UNIFIED_SEARCH_SERVICE } from './api';
import { SearchController } from './controller/search.controller';
import { PostgresFtsSearchService } from './service/postgres-fts-search.service';

/**
 * Phase 5 (build-guide.md): retrieval behind UnifiedSearchService.
 * Controllers inject UNIFIED_SEARCH_SERVICE — swapping Postgres FTS for an
 * index later is a provider change, not a controller rewrite.
 */
@Module({
  controllers: [SearchController],
  providers: [
    PostgresFtsSearchService,
    {
      provide: UNIFIED_SEARCH_SERVICE,
      useExisting: PostgresFtsSearchService,
    },
  ],
  exports: [UNIFIED_SEARCH_SERVICE],
})
export class SearchModule {}
