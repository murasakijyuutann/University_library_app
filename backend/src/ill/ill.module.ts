import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { MemberModule } from '../member/member.module';
import { IllRequestService } from './service/ill-request.service';
import { IllRequestController } from './controller/ill-request.controller';

// Phase 3 (build-guide.md): the IllRequestStatus state machine (minimal seam)
// lives on IllRequestService. The librarian-facing review workflow and
// external fulfillment integration are later work. Phase 4 adds the thin
// controller over it.
@Module({
  imports: [SecurityModule, MemberModule],
  controllers: [IllRequestController],
  providers: [IllRequestService],
  exports: [IllRequestService],
})
export class IllModule {}
