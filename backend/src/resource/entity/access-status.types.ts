/**
 * The access-contract outcome — what AccessPolicyResolver (Phase 3) ultimately
 * decides for a (member, resource) pair. Kept here rather than as a stored
 * column: access status is *computed* per request from live facts (embargo
 * date, license validity/scope, submission status), not persisted — a stored
 * "resource status" column would be a second source of truth that drifts from
 * those facts (see entity-reference_v2.md and project-structure_v3.md §2.3 for
 * the reasoning that led here; the schema itself carries no `status` column on
 * `resource`).
 */
export type AccessStatus =
  | 'AVAILABLE'
  | 'LICENSE_GATED'
  | 'EMBARGOED'
  | 'SUPERVISED_ONLY'
  | 'DEPARTMENT_SCOPED';
