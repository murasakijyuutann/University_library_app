/**
 * Catalog-facing access category for search facets/summaries.
 * Computed from resource facts (not a stored column) — see access-status.types
 * on the resource module for the member-scoped AccessPolicyResolver variant.
 */
export type CatalogAccessStatus =
  | 'AVAILABLE'
  | 'LICENSE_GATED'
  | 'EMBARGOED'
  | 'SUPERVISED_ONLY'
  | 'DEPARTMENT_SCOPED';

export enum FacetDimension {
  RESOURCE_TYPE = 'RESOURCE_TYPE',
  DEPARTMENT = 'DEPARTMENT',
  YEAR = 'YEAR',
  LANGUAGE = 'LANGUAGE',
  DEGREE_TYPE = 'DEGREE_TYPE',
  ACCESS_STATUS = 'ACCESS_STATUS',
}

export interface FacetFilter {
  readonly dimension: FacetDimension;
  readonly value: string;
}

export interface FacetCount {
  readonly dimension: FacetDimension;
  readonly value: string;
  readonly count: number;
}
