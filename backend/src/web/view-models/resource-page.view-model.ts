import {
  CatalogAccessStatus,
  ResourceSummaryDto,
} from '../../search/api';

export type ResourcePageViewModel =
  | PhysicalBookPageViewModel
  | ThesisPageViewModel
  | JournalArticlePageViewModel
  | ResearchReportPageViewModel
  | RareMaterialPageViewModel;

interface ResourcePageBase {
  readonly id: string;
  readonly title: string;
  readonly department: string | null;
  readonly accessStatus: CatalogAccessStatus;
  readonly accessStatusLabel: string;
  readonly accessStatusTone: 'ok' | 'warn' | 'block';
  readonly detailUrl: string;
}

export interface PhysicalBookPageViewModel extends ResourcePageBase {
  readonly type: 'PHYSICAL_BOOK';
  readonly typeLabel: 'Physical book';
  readonly isbn: string | null;
  readonly author: string | null;
  readonly publicationYear: number | null;
  readonly canBorrow: boolean;
  readonly canReserve: boolean;
}

export interface ThesisPageViewModel extends ResourcePageBase {
  readonly type: 'THESIS';
  readonly typeLabel: 'Thesis';
  readonly degreeType: string | null;
  readonly embargoUntil: string | null;
}

export interface JournalArticlePageViewModel extends ResourcePageBase {
  readonly type: 'JOURNAL_ARTICLE';
  readonly typeLabel: 'Journal article';
  readonly doi: string | null;
  readonly volume: string | null;
  readonly issue: string | null;
}

export interface ResearchReportPageViewModel extends ResourcePageBase {
  readonly type: 'RESEARCH_REPORT';
  readonly typeLabel: 'Research report';
  readonly departmentScope: string | null;
  readonly reportYear: number | null;
}

export interface RareMaterialPageViewModel extends ResourcePageBase {
  readonly type: 'RARE_MATERIAL';
  readonly typeLabel: 'Rare material';
  readonly readingRoomOnly: boolean;
}

/** Compile-time exhaustive template map (Phase 6.2). */
export const RESOURCE_TEMPLATE: Record<ResourcePageViewModel['type'], string> = {
  PHYSICAL_BOOK: 'resources/physical-book',
  THESIS: 'resources/thesis',
  JOURNAL_ARTICLE: 'resources/journal-article',
  RESEARCH_REPORT: 'resources/research-report',
  RARE_MATERIAL: 'resources/rare-material',
};

export const RESOURCE_SUMMARY_PARTIAL: Record<
  ResourceSummaryDto['type'],
  string
> = {
  PHYSICAL_BOOK: 'resources/summary-physical-book',
  THESIS: 'resources/summary-thesis',
  JOURNAL_ARTICLE: 'resources/summary-journal-article',
  RESEARCH_REPORT: 'resources/summary-research-report',
  RARE_MATERIAL: 'resources/summary-rare-material',
};
