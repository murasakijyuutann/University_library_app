import { Injectable } from '@nestjs/common';
import { DegreeType, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityNotFoundException } from '../../common/exception/entity-not-found.exception';
import { StateTransitionValidator } from '../../common/statemachine/state-transition.validator';
import { SUBMISSION_TRANSITIONS } from '../../common/statemachine/transition-rules';

export interface CreateThesisSubmissionInput {
  readonly studentMemberId: bigint;
  readonly degreeType?: DegreeType;
}

/**
 * Deliberately minimal for Phase 3 (build-guide.md): the point of this phase
 * is proving StateTransitionValidator holds across every machine, not
 * building the full submission workflow (supervisor-approval routing, embargo
 * request handling, the publish-time projection into a Thesis catalog row —
 * see project-structure_v3.md §2.7). Those richer behaviors are later work;
 * `transition()` here is the honest, minimal state-machine seam they'll hang
 * off of.
 */
@Injectable()
export class ThesisSubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateTransitionValidator: StateTransitionValidator,
  ) {}

  async createDraft(input: CreateThesisSubmissionInput) {
    return this.prisma.thesisSubmission.create({
      data: {
        studentMemberId: input.studentMemberId,
        degreeType: input.degreeType,
        submissionStatus: SubmissionStatus.DRAFT,
      },
    });
  }

  async transition(submissionId: bigint, to: SubmissionStatus) {
    const submission = await this.prisma.thesisSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) {
      throw new EntityNotFoundException('ThesisSubmission', submissionId);
    }

    this.stateTransitionValidator.assertLegal(
      'ThesisSubmission',
      SUBMISSION_TRANSITIONS,
      submission.submissionStatus,
      to,
    );

    return this.prisma.thesisSubmission.update({
      where: { id: submissionId },
      data: {
        submissionStatus: to,
        submittedAt:
          to === SubmissionStatus.SUBMITTED
            ? new Date()
            : submission.submittedAt,
      },
    });
  }
}
