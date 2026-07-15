import { Injectable } from '@nestjs/common';
import { ResourceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateJournalArticleInput,
  CreatePhysicalBookInput,
  CreateRareMaterialInput,
  CreateResearchReportInput,
  CreateThesisInput,
} from '../dto/create-resource.input';
import { ResourceEntity, assertUnreachable } from '../entity/resource.types';
import {
  toJournalArticleResource,
  toPhysicalBookResource,
  toRareMaterialResource,
  toResearchReportResource,
  toThesisResource,
} from '../entity/resource.mapper';

/**
 * Owns the Resource hierarchy invariant (build-guide.md Phase 1; project-structure_v3.md
 * §2.3): because Prisma has no table inheritance, every `create*` method below writes
 * the base `resource` row and its subtype row inside one `prisma.$transaction`, so a
 * subtype row can never exist without its base row (and vice versa) — a failure anywhere
 * in the transaction rolls back both halves, leaving neither.
 *
 * The read path (`findById`) demonstrates the payoff of the discriminated union: the
 * switch over `resource.resourceType` is exhaustive, enforced by `assertUnreachable` in
 * the `default` branch — add a sixth ResourceType member and this file stops compiling
 * exactly where the missing case would need to be handled.
 */
@Injectable()
export class ResourceService {
  constructor(private readonly prisma: PrismaService) {}

  async createPhysicalBook(input: CreatePhysicalBookInput) {
    const { resource, book } = await this.prisma.$transaction(async (tx) => {
      const resource = await tx.resource.create({
        data: {
          resourceType: ResourceType.PHYSICAL_BOOK,
          title: input.title,
          description: input.description ?? null,
          department: input.department ?? null,
        },
      });
      const book = await tx.physicalBook.create({
        data: {
          id: resource.id,
          isbn: input.isbn ?? null,
          author: input.author ?? null,
          publisher: input.publisher ?? null,
          publicationYear: input.publicationYear ?? null,
          callNumber: input.callNumber ?? null,
        },
      });
      return { resource, book };
    });
    return toPhysicalBookResource(resource, book);
  }

  async createThesis(input: CreateThesisInput) {
    const { resource, thesis } = await this.prisma.$transaction(async (tx) => {
      const resource = await tx.resource.create({
        data: {
          resourceType: ResourceType.THESIS,
          title: input.title,
          description: input.description ?? null,
          department: input.department ?? null,
        },
      });
      const thesis = await tx.thesis.create({
        data: {
          id: resource.id,
          studentMemberId: input.studentMemberId,
          degreeType: input.degreeType,
          embargoUntil: input.embargoUntil ?? null,
        },
      });
      return { resource, thesis };
    });
    return toThesisResource(resource, thesis);
  }

  async createJournalArticle(input: CreateJournalArticleInput) {
    const { resource, article } = await this.prisma.$transaction(async (tx) => {
      const resource = await tx.resource.create({
        data: {
          resourceType: ResourceType.JOURNAL_ARTICLE,
          title: input.title,
          description: input.description ?? null,
          department: input.department ?? null,
        },
      });
      const article = await tx.journalArticle.create({
        data: {
          id: resource.id,
          doi: input.doi ?? null,
          volume: input.volume ?? null,
          issue: input.issue ?? null,
          pageRange: input.pageRange ?? null,
          journalId: input.journalId ?? null,
          licenseId: input.licenseId ?? null,
        },
      });
      return { resource, article };
    });
    return toJournalArticleResource(resource, article);
  }

  async createResearchReport(input: CreateResearchReportInput) {
    const { resource, report } = await this.prisma.$transaction(async (tx) => {
      const resource = await tx.resource.create({
        data: {
          resourceType: ResourceType.RESEARCH_REPORT,
          title: input.title,
          description: input.description ?? null,
          department: input.department ?? null,
        },
      });
      const report = await tx.researchReport.create({
        data: {
          id: resource.id,
          departmentScope: input.departmentScope ?? null,
          reportYear: input.reportYear ?? null,
        },
      });
      return { resource, report };
    });
    return toResearchReportResource(resource, report);
  }

  async createRareMaterial(input: CreateRareMaterialInput) {
    const { resource, rare } = await this.prisma.$transaction(async (tx) => {
      const resource = await tx.resource.create({
        data: {
          resourceType: ResourceType.RARE_MATERIAL,
          title: input.title,
          description: input.description ?? null,
          department: input.department ?? null,
        },
      });
      const rare = await tx.rareMaterial.create({
        data: {
          id: resource.id,
          readingRoomOnly: input.readingRoomOnly ?? true,
          handlingNotes: input.handlingNotes ?? null,
        },
      });
      return { resource, rare };
    });
    return toRareMaterialResource(resource, rare);
  }

  /**
   * Reads a resource and narrows it to its concrete subtype via the discriminated
   * union (build-guide.md task 1.4). The narrowing is compiler-verified: each
   * branch fetches exactly the subtype table implied by `resourceType`, and the
   * `default` branch only compiles because every ResourceType member is handled
   * above it.
   */
  async findById(id: bigint): Promise<ResourceEntity | null> {
    const resource = await this.prisma.resource.findUnique({ where: { id } });
    if (!resource) {
      return null;
    }

    switch (resource.resourceType) {
      case ResourceType.PHYSICAL_BOOK: {
        const book = await this.prisma.physicalBook.findUniqueOrThrow({
          where: { id },
        });
        return toPhysicalBookResource(resource, book);
      }
      case ResourceType.THESIS: {
        const thesis = await this.prisma.thesis.findUniqueOrThrow({
          where: { id },
        });
        return toThesisResource(resource, thesis);
      }
      case ResourceType.JOURNAL_ARTICLE: {
        const article = await this.prisma.journalArticle.findUniqueOrThrow({
          where: { id },
        });
        return toJournalArticleResource(resource, article);
      }
      case ResourceType.RESEARCH_REPORT: {
        const report = await this.prisma.researchReport.findUniqueOrThrow({
          where: { id },
        });
        return toResearchReportResource(resource, report);
      }
      case ResourceType.RARE_MATERIAL: {
        const rare = await this.prisma.rareMaterial.findUniqueOrThrow({
          where: { id },
        });
        return toRareMaterialResource(resource, rare);
      }
      default:
        return assertUnreachable(resource.resourceType);
    }
  }
}
