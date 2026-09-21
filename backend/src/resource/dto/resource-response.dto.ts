import { ResourceEntity, assertUnreachable } from '../entity/resource.types';

/** JSON-safe projection of ResourceEntity — bigint ids/Date fields become strings. */
export type ResourceResponse =
  | {
      id: string;
      resourceType: 'PHYSICAL_BOOK';
      title: string;
      description: string | null;
      department: string | null;
      createdAt: string;
      updatedAt: string;
      detail: {
        isbn: string | null;
        author: string | null;
        publisher: string | null;
        publicationYear: number | null;
        callNumber: string | null;
      };
    }
  | {
      id: string;
      resourceType: 'THESIS';
      title: string;
      description: string | null;
      department: string | null;
      createdAt: string;
      updatedAt: string;
      detail: {
        studentMemberId: string;
        degreeType: string | null;
        embargoUntil: string | null;
      };
    }
  | {
      id: string;
      resourceType: 'JOURNAL_ARTICLE';
      title: string;
      description: string | null;
      department: string | null;
      createdAt: string;
      updatedAt: string;
      detail: {
        doi: string | null;
        volume: string | null;
        issue: string | null;
        pageRange: string | null;
        journalId: string | null;
        licenseId: string | null;
      };
    }
  | {
      id: string;
      resourceType: 'RESEARCH_REPORT';
      title: string;
      description: string | null;
      department: string | null;
      createdAt: string;
      updatedAt: string;
      detail: {
        departmentScope: string | null;
        reportYear: number | null;
      };
    }
  | {
      id: string;
      resourceType: 'RARE_MATERIAL';
      title: string;
      description: string | null;
      department: string | null;
      createdAt: string;
      updatedAt: string;
      detail: {
        readingRoomOnly: boolean;
        handlingNotes: string | null;
      };
    };

export function toResourceResponse(entity: ResourceEntity): ResourceResponse {
  const base = {
    id: entity.id.toString(),
    title: entity.title,
    description: entity.description,
    department: entity.department,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };

  switch (entity.resourceType) {
    case 'PHYSICAL_BOOK':
      return { ...base, resourceType: 'PHYSICAL_BOOK', detail: entity.detail };
    case 'THESIS':
      return {
        ...base,
        resourceType: 'THESIS',
        detail: {
          studentMemberId: entity.detail.studentMemberId.toString(),
          degreeType: entity.detail.degreeType,
          embargoUntil: entity.detail.embargoUntil ? entity.detail.embargoUntil.toISOString().slice(0, 10) : null,
        },
      };
    case 'JOURNAL_ARTICLE':
      return {
        ...base,
        resourceType: 'JOURNAL_ARTICLE',
        detail: {
          doi: entity.detail.doi,
          volume: entity.detail.volume,
          issue: entity.detail.issue,
          pageRange: entity.detail.pageRange,
          journalId: entity.detail.journalId ? entity.detail.journalId.toString() : null,
          licenseId: entity.detail.licenseId ? entity.detail.licenseId.toString() : null,
        },
      };
    case 'RESEARCH_REPORT':
      return { ...base, resourceType: 'RESEARCH_REPORT', detail: entity.detail };
    case 'RARE_MATERIAL':
      return { ...base, resourceType: 'RARE_MATERIAL', detail: entity.detail };
    default:
      return assertUnreachable(entity);
  }
}
