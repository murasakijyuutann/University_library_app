/**
 * The Resource hierarchy — hand-modeled discriminated union.
 *
 * Prisma has no table inheritance (see stack-decision.md §1/§2a), so the six-table
 * hierarchy (Resource + five subtypes) is mapped by hand to a base shape plus a
 * TypeScript discriminated union keyed on `resourceType`. This union — not the
 * Prisma-generated row types — is the shared vocabulary the rest of the stack
 * (DTOs, and later the frontend) depends on, so a caller narrowing on `resourceType`
 * gets compiler-enforced exhaustiveness: a missing case is a compile error, and a
 * hypothetical sixth subtype breaks compilation exactly where that exhaustiveness
 * is asserted (see `assertNever` below and its use in ResourceService).
 */

export type ResourceType =
  | 'PHYSICAL_BOOK'
  | 'THESIS'
  | 'JOURNAL_ARTICLE'
  | 'RESEARCH_REPORT'
  | 'RARE_MATERIAL';

/** Fields shared by every Resource subtype — the base `resource` row. */
export interface ResourceBase {
  readonly id: bigint;
  readonly title: string;
  readonly description: string | null;
  readonly department: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PhysicalBookDetail {
  readonly isbn: string | null;
  readonly author: string | null;
  readonly publisher: string | null;
  readonly publicationYear: number | null;
  readonly callNumber: string | null;
}

export interface ThesisDetail {
  readonly studentMemberId: bigint;
  readonly degreeType: 'BACHELOR' | 'MASTER' | 'PHD' | null;
  readonly embargoUntil: Date | null;
}

export interface JournalArticleDetail {
  readonly doi: string | null;
  readonly volume: string | null;
  readonly issue: string | null;
  readonly pageRange: string | null;
  readonly journalId: bigint | null;
  readonly licenseId: bigint | null;
}

export interface ResearchReportDetail {
  readonly departmentScope: string | null;
  readonly reportYear: number | null;
}

export interface RareMaterialDetail {
  readonly readingRoomOnly: boolean;
  readonly handlingNotes: string | null;
}

export interface PhysicalBookResource extends ResourceBase {
  readonly resourceType: 'PHYSICAL_BOOK';
  readonly detail: PhysicalBookDetail;
}

export interface ThesisResource extends ResourceBase {
  readonly resourceType: 'THESIS';
  readonly detail: ThesisDetail;
}

export interface JournalArticleResource extends ResourceBase {
  readonly resourceType: 'JOURNAL_ARTICLE';
  readonly detail: JournalArticleDetail;
}

export interface ResearchReportResource extends ResourceBase {
  readonly resourceType: 'RESEARCH_REPORT';
  readonly detail: ResearchReportDetail;
}

export interface RareMaterialResource extends ResourceBase {
  readonly resourceType: 'RARE_MATERIAL';
  readonly detail: RareMaterialDetail;
}

/** The discriminated union every consumer (service, DTO, frontend) narrows on. */
export type ResourceEntity =
  | PhysicalBookResource
  | ThesisResource
  | JournalArticleResource
  | ResearchReportResource
  | RareMaterialResource;

/**
 * Exhaustiveness helper — the `never`-assertion pattern (build-guide.md, task 1.2).
 * Call this in the `default` branch of a switch over `ResourceEntity['resourceType']`
 * (or a Prisma `ResourceType` enum value). If a case is ever left unhandled, `value`
 * will not be typed `never` at the call site and the file fails to compile.
 */
export function assertUnreachable(value: never): never {
  throw new Error(`Unhandled resource discriminant: ${JSON.stringify(value)}`);
}
