/**
 * Phase 5.1 (build-guide.md; search-interface-contract.md) — the retrieval
 * contract lives in `search/api` with **zero** persistence imports. Callers
 * depend on this module; Postgres FTS (and later an index) implement it.
 * dependency-cruiser fails the build if this folder imports Prisma.
 */

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

export interface Pagination {
  readonly page: number;
  readonly size: number;
}

/** Clamp page/size so neither implementation can be DoS'd via page size. */
export function clampPagination(page: Pagination): Pagination {
  const rawPage = Number.isFinite(page.page) ? Math.trunc(page.page) : 1;
  const rawSize = Number.isFinite(page.size) ? Math.trunc(page.size) : DEFAULT_PAGE_SIZE;
  return {
    page: Math.max(1, rawPage),
    size: Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize)),
  };
}
