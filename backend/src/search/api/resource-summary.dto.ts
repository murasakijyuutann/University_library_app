import { CatalogAccessStatus } from './facet';

/**
 * Discriminated summary returned by search (search-interface-contract.md §3;
 * project-structure_v3.md §2.3). Same shape the SPA will render — keyed on
 * `type`, with a small typed `detail` per subtype. No relevance `score`.
 */
export type ResourceSummaryDto =
  | {
      readonly id: string;
      readonly type: 'PHYSICAL_BOOK';
      readonly title: string;
      readonly accessStatus: CatalogAccessStatus;
      readonly department: string | null;
      readonly detail: {
        readonly isbn: string | null;
        readonly author: string | null;
        readonly publicationYear: number | null;
      };
    }
  | {
      readonly id: string;
      readonly type: 'THESIS';
      readonly title: string;
      readonly accessStatus: CatalogAccessStatus;
      readonly department: string | null;
      readonly detail: {
        readonly degreeType: string | null;
        readonly embargoUntil: string | null;
      };
    }
  | {
      readonly id: string;
      readonly type: 'JOURNAL_ARTICLE';
      readonly title: string;
      readonly accessStatus: CatalogAccessStatus;
      readonly department: string | null;
      readonly detail: {
        readonly doi: string | null;
        readonly volume: string | null;
        readonly issue: string | null;
      };
    }
  | {
      readonly id: string;
      readonly type: 'RESEARCH_REPORT';
      readonly title: string;
      readonly accessStatus: CatalogAccessStatus;
      readonly department: string | null;
      readonly detail: {
        readonly departmentScope: string | null;
        readonly reportYear: number | null;
      };
    }
  | {
      readonly id: string;
      readonly type: 'RARE_MATERIAL';
      readonly title: string;
      readonly accessStatus: CatalogAccessStatus;
      readonly department: string | null;
      readonly detail: {
        readonly readingRoomOnly: boolean;
      };
    };
