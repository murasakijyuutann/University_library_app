import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DegreeType, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityNotFoundException } from '../../common/exception/entity-not-found.exception';
import { StateTransitionValidator } from '../../common/statemachine/state-transition.validator';
import { SUBMISSION_TRANSITIONS } from '../../common/statemachine/transition-rules';
import {
  OBJECT_STORAGE,
  ObjectStorage,
  PresignedUpload,
} from '../../storage/object-storage.port';

export interface CreateThesisSubmissionInput {
  readonly studentMemberId: bigint;
  readonly degreeType?: DegreeType;
}

/**
 * Thesis submission workflow: draft → upload PDF (presigned) → submit, then
 * staff transitions. Phase 6.5 adds the upload/confirm seam so Nest never
 * streams production file bytes (S3) — only metadata lands in `filePath`.
 */
@Injectable()
export class ThesisSubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateTransitionValidator: StateTransitionValidator,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
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

  async findById(submissionId: bigint) {
    return this.prisma.thesisSubmission.findUnique({ where: { id: submissionId } });
  }

  async createUploadUrl(
    submissionId: bigint,
    contentType: string,
  ): Promise<PresignedUpload & { submissionId: string }> {
    if (contentType !== 'application/pdf') {
      throw new BadRequestException('Only application/pdf uploads are accepted.');
    }
    const submission = await this.requireDraft(submissionId);
    const key = `theses/${submission.id.toString()}/${Date.now()}.pdf`;
    const upload = await this.objectStorage.createUploadUrl({
      key,
      contentType,
      expiresInSeconds: 900,
    });
    return { ...upload, submissionId: submission.id.toString() };
  }

  async confirmUpload(submissionId: bigint, key: string) {
    const submission = await this.requireDraft(submissionId);
    const prefix = `theses/${submission.id.toString()}/`;
    if (!key.startsWith(prefix) || key.includes('..')) {
      throw new BadRequestException('Upload key does not belong to this submission.');
    }
    return this.prisma.thesisSubmission.update({
      where: { id: submissionId },
      data: {
        filePath: key,
        version: { increment: 1 },
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

    if (to === SubmissionStatus.SUBMITTED && !submission.filePath) {
      throw new BadRequestException(
        'Attach a PDF before submitting the thesis draft.',
      );
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
        version: { increment: 1 },
      },
    });
  }

  private async requireDraft(submissionId: bigint) {
    const submission = await this.prisma.thesisSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) {
      throw new EntityNotFoundException('ThesisSubmission', submissionId);
    }
    if (submission.submissionStatus !== SubmissionStatus.DRAFT) {
      throw new BadRequestException('Uploads are only allowed while the submission is a draft.');
    }
    return submission;
  }
}
