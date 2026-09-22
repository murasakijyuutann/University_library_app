import { Controller, Get, Inject, Query, Render, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import {
  FacetDimension,
  FacetFilter,
  SearchQuery,
  UNIFIED_SEARCH_SERVICE,
  UnifiedSearchService,
} from '../../search/api';
import { ResourcePresenter } from '../presenters/resource.presenter';
import { RESOURCE_SUMMARY_PARTIAL } from '../view-models/resource-page.view-model';

@Controller('search')
export class WebSearchController {
  constructor(
    @Inject(UNIFIED_SEARCH_SERVICE)
    private readonly searchService: UnifiedSearchService,
    private readonly resourcePresenter: ResourcePresenter,
  ) {}

  @Get()
  @Render('search/index')
  async searchPage(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('department') department?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.buildModel(req, { q, type, department, page, size });
  }

  /** HTMX partial — same UnifiedSearchService as the full page (Phase 6.3). */
  @Get('results')
  async searchResults(
    @Req() req: Request,
    @Res() res: Response,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('department') department?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<void> {
    const model = await this.buildModel(req, { q, type, department, page, size });
    res.render('search/results', model);
  }

  private async buildModel(
    req: Request,
    input: {
      q?: string;
      type?: string;
      department?: string;
      page?: string;
      size?: string;
    },
  ) {
    const searchQuery = this.toSearchQuery(input);
    const results = await this.searchService.search(searchQuery);
    const items = results.results.map((summary) => ({
      viewModel: this.resourcePresenter.toSummaryViewModel(summary),
      partial: RESOURCE_SUMMARY_PARTIAL[summary.type],
    }));

    return {
      title: 'Catalog search',
      csrfToken: req.res?.locals.csrfToken,
      q: input.q ?? '',
      type: input.type ?? '',
      department: input.department ?? '',
      page: results.page.page,
      size: results.page.size,
      totalMatches: results.totalMatches,
      facets: results.facets.filter((f) => f.dimension === FacetDimension.RESOURCE_TYPE),
      items,
      prevPage: results.page.page > 1 ? results.page.page - 1 : null,
      nextPage:
        results.page.page * results.page.size < results.totalMatches
          ? results.page.page + 1
          : null,
      queryString: this.buildQueryString(input),
    };
  }

  private toSearchQuery(input: {
    q?: string;
    type?: string;
    department?: string;
    page?: string;
    size?: string;
  }): SearchQuery {
    const filters: FacetFilter[] = [];
    if (input.type) {
      filters.push({ dimension: FacetDimension.RESOURCE_TYPE, value: input.type });
    }
    if (input.department) {
      filters.push({ dimension: FacetDimension.DEPARTMENT, value: input.department });
    }
    return {
      text: input.q ?? '',
      filters,
      page: {
        page: Number.parseInt(input.page ?? '1', 10) || 1,
        size: Number.parseInt(input.size ?? '10', 10) || 10,
      },
    };
  }

  private buildQueryString(input: {
    q?: string;
    department?: string;
    size?: string;
  }): string {
    const params = new URLSearchParams();
    if (input.q) params.set('q', input.q);
    if (input.department) params.set('department', input.department);
    if (input.size) params.set('size', input.size);
    const qs = params.toString();
    return qs ? `&${qs}` : '';
  }
}
