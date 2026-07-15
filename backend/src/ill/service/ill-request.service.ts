import { Injectable } from '@nestjs/common';
import { IllRequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityNotFoundException } from '../../common/exception/entity-not-found.exception';
import { StateTransitionValidator } from '../../common/statemachine/state-transition.validator';
import { ILL_REQUEST_TRANSITIONS } from '../../common/statemachine/transition-rules';

export interface CreateIllRequestInput {
  readonly memberId: bigint;
  readonly title: string;
  readonly author?: string;
  readonly doiOrIsbn?: string;
  readonly justification?: string;
}

/**
 * Deliberately minimal for Phase 3 (build-guide.md), matching
 * ThesisSubmissionService's scope note: proves the validator holds for the
 * IllRequestStatus machine; the librarian-facing review workflow and external
 * fulfillment integration are later work.
 */
@Injectable()
export class IllRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateTransitionValidator: StateTransitionValidator,
  ) {}

  async submit(input: CreateIllRequestInput) {
    return this.prisma.illRequest.create({
      data: {
        memberId: input.memberId,
        title: input.title,
        author: input.author,
        doiOrIsbn: input.doiOrIsbn,
        justification: input.justification,
        status: IllRequestStatus.SUBMITTED,
      },
    });
  }

  async transition(requestId: bigint, to: IllRequestStatus) {
    const request = await this.prisma.illRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new EntityNotFoundException('IllRequest', requestId);
    }

    this.stateTransitionValidator.assertLegal(
      'IllRequest',
      ILL_REQUEST_TRANSITIONS,
      request.status,
      to,
    );

    return this.prisma.illRequest.update({
      where: { id: requestId },
      data: { status: to },
    });
  }
}
