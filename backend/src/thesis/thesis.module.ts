import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { MemberModule } from '../member/member.module';
import { ThesisSubmissionService } from './service/thesis-submission.service';
import { ThesisSubmissionController } from './controller/thesis-submission.controller';

// Phase 3 (build-guide.md): the submission state machine (minimal seam) lives
// on ThesisSubmissionService. Phase 6.5 adds presigned upload via global StorageModule.
@Module({
  imports: [SecurityModule, MemberModule],
  controllers: [ThesisSubmissionController],
  providers: [ThesisSubmissionService],
  exports: [ThesisSubmissionService],
})
export class ThesisModule {}
