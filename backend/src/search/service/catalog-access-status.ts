import { CatalogAccessStatus } from '../api';

/** Catalog-level access label for search (no member context). */
export function catalogAccessStatus(input: {
  resourceType: string;
  embargoUntil: Date | null;
  departmentScope: string | null;
}): CatalogAccessStatus {
  switch (input.resourceType) {
    case 'PHYSICAL_BOOK':
      return 'AVAILABLE';
    case 'THESIS': {
      const embargoed =
        input.embargoUntil !== null && input.embargoUntil.getTime() > Date.now();
      return embargoed ? 'EMBARGOED' : 'AVAILABLE';
    }
    case 'JOURNAL_ARTICLE':
      return 'LICENSE_GATED';
    case 'RESEARCH_REPORT':
      return input.departmentScope ? 'DEPARTMENT_SCOPED' : 'AVAILABLE';
    case 'RARE_MATERIAL':
      return 'SUPERVISED_ONLY';
    default:
      return 'AVAILABLE';
  }
}
