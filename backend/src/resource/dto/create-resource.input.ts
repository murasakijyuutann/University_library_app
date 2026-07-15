/**
 * Inputs for ResourceService's create* methods (build-guide.md task 1.3).
 * Deliberately separate from resource.types.ts's read-side union: creation
 * needs "not yet created" shapes (no id/timestamps), and keeping the two
 * separate avoids a single type trying to serve both directions.
 */

export interface CreatePhysicalBookInput {
  readonly title: string;
  readonly description?: string;
  readonly department?: string;
  readonly isbn?: string;
  readonly author?: string;
  readonly publisher?: string;
  readonly publicationYear?: number;
  readonly callNumber?: string;
}

export interface CreateThesisInput {
  readonly title: string;
  readonly description?: string;
  readonly department?: string;
  readonly studentMemberId: bigint;
  readonly degreeType?: 'BACHELOR' | 'MASTER' | 'PHD';
  readonly embargoUntil?: Date;
}

export interface CreateJournalArticleInput {
  readonly title: string;
  readonly description?: string;
  readonly department?: string;
  readonly doi?: string;
  readonly volume?: string;
  readonly issue?: string;
  readonly pageRange?: string;
  readonly journalId?: bigint;
  readonly licenseId?: bigint;
}

export interface CreateResearchReportInput {
  readonly title: string;
  readonly description?: string;
  readonly department?: string;
  readonly departmentScope?: string;
  readonly reportYear?: number;
}

export interface CreateRareMaterialInput {
  readonly title: string;
  readonly description?: string;
  readonly department?: string;
  readonly readingRoomOnly?: boolean;
  readonly handlingNotes?: string;
}
