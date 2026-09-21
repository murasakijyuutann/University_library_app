import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { MemberModule } from '../member/member.module';
import { ThesisSubmissionService } from './service/thesis-submission.service';
import { ThesisSubmissionController } from './controller/thesis-submission.controller';

// Phase 3 (build-guide.md): the submission state machine (minimal seam) lives
// on ThesisSubmissionService. The fuller workflow (supervisor approval,
// embargo requests, publish-time projection into a Thesis catalog row) is
// later work — see the service's own doc comment. Phase 4 adds the thin
// controller over it.
@Module({
  imports: [SecurityModule, MemberModule],
  controllers: [ThesisSubmissionController],
  providers: [ThesisSubmissionService],
  exports: [ThesisSubmissionService],
})
export class ThesisModule {}
