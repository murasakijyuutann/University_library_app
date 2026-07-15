import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberContext } from '../../member/entity/member.types';
import { AccessDecision } from '../entity/access-decision.types';
import { ResourceEntity, assertUnreachable } from '../entity/resource.types';

/**
 * The single most important provider in the project (project-structure_v3.md
 * §2.3; build-guide.md Phase 3.1): the access-contract table for all five
 * Resource subtypes, made real branching logic in one resolvable place instead
 * of duplicated `if` chains scattered across controllers.
 *
 * The discriminated union from Phase 1 drives exhaustive per-type dispatch —
 * `assertUnreachable` in the `default` branch means a sixth subtype breaks
 * compilation here first, exactly like it does in ResourceService.
 */
@Injectable()
export class AccessPolicyResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    member: MemberContext,
    resource: ResourceEntity,
  ): Promise<AccessDecision> {
    switch (resource.resourceType) {
      case 'PHYSICAL_BOOK':
        return this.resolvePhysicalBook();
      case 'THESIS':
        return this.resolveThesis(resource);
      case 'JOURNAL_ARTICLE':
        return this.resolveJournalArticle(member, resource);
      case 'RESEARCH_REPORT':
        return this.resolveResearchReport(member, resource);
      case 'RARE_MATERIAL':
        return this.resolveRareMaterial();
      default:
        return assertUnreachable(resource);
    }
  }

  /**
   * Borrowing is institution-wide, not member-scoped — whether a specific copy
   * is on the shelf right now is LoanService's concern (ResourceCopy status),
   * not an access-contract question. AccessPolicyResolver only answers "may
   * this member attempt to borrow this resource type at all," which for a
   * physical book is unconditionally yes.
   */
  private resolvePhysicalBook(): AccessDecision {
    return {
      allowed: true,
      status: 'AVAILABLE',
      reason:
        'Physical books are borrowable by any member; copy availability is checked at borrow time.',
    };
  }

  /**
   * Submission-status gating happens one layer up, structurally: an
   * unpublished ThesisSubmission never projects a Thesis catalog row (see
   * project-structure_v3.md §2.7), so reaching this resolver at all already
   * implies PUBLISHED. The only live gate left to check here is the embargo.
   */
  private resolveThesis(
    resource: Extract<ResourceEntity, { resourceType: 'THESIS' }>,
  ): AccessDecision {
    const { embargoUntil } = resource.detail;
    const isEmbargoed =
      embargoUntil !== null && embargoUntil.getTime() > Date.now();

    if (isEmbargoed) {
      return {
        allowed: false,
        status: 'EMBARGOED',
        // embargoUntil is non-null in this branch (isEmbargoed narrowed it).
        reason: `Embargoed until ${(embargoUntil as Date).toISOString().slice(0, 10)}.`,
      };
    }
    return {
      allowed: true,
      status: 'AVAILABLE',
      reason: 'Embargo (if any) has lifted; thesis is publicly accessible.',
    };
  }

  private async resolveJournalArticle(
    member: MemberContext,
    resource: Extract<ResourceEntity, { resourceType: 'JOURNAL_ARTICLE' }>,
  ): Promise<AccessDecision> {
    const { licenseId } = resource.detail;
    if (licenseId === null) {
      return {
        allowed: false,
        status: 'LICENSE_GATED',
        reason: 'No license is associated with this article.',
      };
    }

    const license = await this.prisma.journalLicense.findUnique({
      where: { id: licenseId },
      include: { facultyScopes: true },
    });
    if (!license) {
      return {
        allowed: false,
        status: 'LICENSE_GATED',
        reason: 'License record not found.',
      };
    }

    const now = Date.now();
    if (license.startsAt && license.startsAt.getTime() > now) {
      return {
        allowed: false,
        status: 'LICENSE_GATED',
        reason: 'License has not started yet.',
      };
    }
    if (license.expiresAt && license.expiresAt.getTime() < now) {
      return {
        allowed: false,
        status: 'LICENSE_GATED',
        reason: 'License has expired.',
      };
    }

    // No scope rows means the license covers the whole institution; scope rows
    // present means only the listed faculties are covered.
    if (license.facultyScopes.length > 0) {
      const covered = license.facultyScopes.some(
        (scope) => scope.faculty === member.faculty,
      );
      if (!covered) {
        return {
          allowed: false,
          status: 'LICENSE_GATED',
          reason: `License does not cover faculty "${member.faculty ?? 'unassigned'}".`,
        };
      }
    }

    // Deliberately NOT enforced here: concurrent-user-limit checking needs live
    // access-session tracking (who is reading this article right now this
    // moment), which doesn't exist yet — there is no usage/session table to
    // count against. Named as a deferred check (matching docs/search-design.md's
    // pattern of naming deferred work explicitly) rather than silently skipped
    // or faked with a meaningless always-true check.
    return {
      allowed: true,
      status: 'AVAILABLE',
      reason: "License is active and covers this member's faculty.",
    };
  }

  /**
   * Granularity mismatch, noted rather than hidden: `Member` carries `faculty`,
   * not a finer-grained `department` — both are FK-in-waiting strings per
   * schema.prisma's own comments, and no real `Department` entity exists yet.
   * Faculty is the closest available scope to compare a report's
   * `departmentScope` against until that entity exists.
   */
  private resolveResearchReport(
    member: MemberContext,
    resource: Extract<ResourceEntity, { resourceType: 'RESEARCH_REPORT' }>,
  ): AccessDecision {
    const { departmentScope } = resource.detail;
    if (departmentScope === null) {
      return {
        allowed: true,
        status: 'AVAILABLE',
        reason: 'Report carries no department restriction.',
      };
    }
    if (member.faculty === departmentScope) {
      return {
        allowed: true,
        status: 'AVAILABLE',
        reason: `Member's faculty matches report scope "${departmentScope}".`,
      };
    }
    return {
      allowed: false,
      status: 'DEPARTMENT_SCOPED',
      reason: `Restricted to "${departmentScope}"; member's faculty is "${member.faculty ?? 'unassigned'}".`,
    };
  }

  /**
   * Never self-service, regardless of member — that is the entire point of
   * the subtype (entity-reference_v2.md §1, RareMaterial). The decision is
   * always "you may request supervised access," never an outright grant.
   */
  private resolveRareMaterial(): AccessDecision {
    return {
      allowed: false,
      status: 'SUPERVISED_ONLY',
      reason:
        'Rare materials require a supervised reading-room request; there is no self-service access.',
    };
  }
}
