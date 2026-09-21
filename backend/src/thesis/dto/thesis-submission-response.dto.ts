import { ThesisSubmission } from '@prisma/client';

export interface ThesisSubmissionResponse {
  readonly id: string;
  readonly studentMemberId: string;
  readonly supervisorMemberId: string | null;
  readonly degreeType: string | null;
  readonly submissionStatus: string;
  readonly embargoUntil: string | null;
  readonly submittedAt: string | null;
  readonly resourceId: string | null;
}

export function toThesisSubmissionResponse(
  submission: ThesisSubmission,
): ThesisSubmissionResponse {
  return {
    id: submission.id.toString(),
    studentMemberId: submission.studentMemberId.toString(),
    supervisorMemberId: submission.supervisorMemberId
      ? submission.supervisorMemberId.toString()
      : null,
    degreeType: submission.degreeType,
    submissionStatus: submission.submissionStatus,
    embargoUntil: submission.embargoUntil ? submission.embargoUntil.toISOString().slice(0, 10) : null,
    submittedAt: submission.submittedAt ? submission.submittedAt.toISOString() : null,
    resourceId: submission.resourceId ? submission.resourceId.toString() : null,
  };
}
