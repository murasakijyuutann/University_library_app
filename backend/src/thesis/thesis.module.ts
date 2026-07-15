import { Module } from '@nestjs/common';
import { ThesisSubmissionService } from './service/thesis-submission.service';

// Phase 3 (build-guide.md): the submission state machine (minimal seam) lives
// on ThesisSubmissionService. The fuller workflow (supervisor approval,
// embargo requests, publish-time projection into a Thesis catalog row) is
// later work — see the service's own doc comment.
@Module({
  providers: [ThesisSubmissionService],
  exports: [ThesisSubmissionService],
})
export class ThesisModule {}
