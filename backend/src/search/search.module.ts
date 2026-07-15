import { Module } from '@nestjs/common';

// Empty scaffold (Phase 0.1, build-guide.md). The UnifiedSearchService
// contract (Phase 5) will live in ./api — a module that must never import
// Prisma or any persistence type (see search-interface-contract.md §4.4 and
// .dependency-cruiser.cjs, which already guards this boundary).
@Module({})
export class SearchModule {}
