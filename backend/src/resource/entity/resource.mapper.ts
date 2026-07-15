import type {
  JournalArticle as PrismaJournalArticle,
  PhysicalBook as PrismaPhysicalBook,
  RareMaterial as PrismaRareMaterial,
  ResearchReport as PrismaResearchReport,
  Resource as PrismaResource,
  Thesis as PrismaThesis,
} from '@prisma/client';
import {
  JournalArticleResource,
  PhysicalBookResource,
  RareMaterialResource,
  ResearchReportResource,
  ResourceBase,
  ThesisResource,
} from './resource.types';

/**
 * Maps Prisma's generated row shapes onto the hand-authored discriminated union
 * (resource.types.ts). Kept as pure functions, isolated from ResourceService, so
 * the "translate persistence row -> shared domain type" step is unit-testable
 * without a database.
 */

function toBase(resource: PrismaResource): ResourceBase {
  return {
    id: resource.id,
    title: resource.title,
    description: resource.description,
    department: resource.department,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  };
}

export function toPhysicalBookResource(
  resource: PrismaResource,
  book: PrismaPhysicalBook,
): PhysicalBookResource {
  return {
    ...toBase(resource),
    resourceType: 'PHYSICAL_BOOK',
    detail: {
      isbn: book.isbn,
      author: book.author,
      publisher: book.publisher,
      publicationYear: book.publicationYear,
      callNumber: book.callNumber,
    },
  };
}

export function toThesisResource(
  resource: PrismaResource,
  thesis: PrismaThesis,
): ThesisResource {
  return {
    ...toBase(resource),
    resourceType: 'THESIS',
    detail: {
      studentMemberId: thesis.studentMemberId,
      degreeType: thesis.degreeType,
      embargoUntil: thesis.embargoUntil,
    },
  };
}

export function toJournalArticleResource(
  resource: PrismaResource,
  article: PrismaJournalArticle,
): JournalArticleResource {
  return {
    ...toBase(resource),
    resourceType: 'JOURNAL_ARTICLE',
    detail: {
      doi: article.doi,
      volume: article.volume,
      issue: article.issue,
      pageRange: article.pageRange,
      journalId: article.journalId,
      licenseId: article.licenseId,
    },
  };
}

export function toResearchReportResource(
  resource: PrismaResource,
  report: PrismaResearchReport,
): ResearchReportResource {
  return {
    ...toBase(resource),
    resourceType: 'RESEARCH_REPORT',
    detail: {
      departmentScope: report.departmentScope,
      reportYear: report.reportYear,
    },
  };
}

export function toRareMaterialResource(
  resource: PrismaResource,
  rare: PrismaRareMaterial,
): RareMaterialResource {
  return {
    ...toBase(resource),
    resourceType: 'RARE_MATERIAL',
    detail: {
      readingRoomOnly: rare.readingRoomOnly,
      handlingNotes: rare.handlingNotes,
    },
  };
}
